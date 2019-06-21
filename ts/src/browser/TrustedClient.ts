import { requestPermission, requestSendCurrency } from "./Actions";
import { hasPermission } from "./Permission";

import ChainClient from "../iso/ChainClient";
import KeyPair from "../iso/KeyPair";
import Message from "../iso/Message";
import SignedMessage from "../iso/SignedMessage";
import Storage from "./Storage";
import { sleep } from "../iso/Util";

// A trusted client that handles interaction with the blockchain nodes.
// This client is trusted in the sense that it holds the user's keypair.
// This object is therefore only kept by the extension.
// A single TrustedClient should exist, in the scope of the background page.
// This wraps a ChainClient which handles the direct communication with the chain.

export default class TrustedClient {
  storage: Storage;
  network: string;

  // Create a new client with no keypair.
  constructor(storage, network) {
    this.storage = storage;
    this.network = network;

    if (typeof chrome == "object") {
      chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
        if (!m.TrustedClient) {
          return false;
        }
        let serializedMessage = m.TrustedClient;
        if (!sender.tab) {
          console.log("unexpected message from no tab:", serializedMessage);
          return false;
        }

        let message = Message.fromSerialized(serializedMessage);
        let host = new URL(sender.tab.url).host;

        this.handleUntrustedMessage(message, host).then(responseMessage => {
          if (responseMessage) {
            sendResponse(responseMessage.serialize());
          }
        });

        return true;
      });
    }
  }

  // Call from the background page
  static init(storage, network) {
    (window as any).client = new TrustedClient(storage, network);
  }

  // Get the global trusted client from the background page
  static get() {
    let client = (chrome.extension.getBackgroundPage() as any).client;
    if (!client) {
      throw new Error("cannot find client");
    }
    return client;
  }

  // Returns null if the user is not logged in
  getKeyPair() {
    let data = this.storage.getData();
    if (!data) {
      return null;
    }
    return data.keyPair;
  }

  // Returns a random keypair if the user is not logged in.
  getBestEffortKeyPair() {
    let kp = this.getKeyPair();
    if (kp) {
      return kp;
    }
    return KeyPair.fromRandom();
  }

  // Signs the individual operations in an operation message
  // Any other fields besides operations are dropped
  signOperationMessage(opm) {
    let kp = this.getKeyPair();
    if (kp == null) {
      throw new Error("cannot sign operation message without a keypair");
    }
    return kp.signOperationMessage(opm);
  }

  // Returns an empty object if there are no permissions for this host, including
  // if the user is not logged in.
  getPermissions(host) {
    let data = this.storage.getData();
    if (!data) {
      return {};
    }
    let answer = data.permissions[host];
    if (!answer) {
      return {};
    }
    return answer;
  }

  // Return true only if they transaction key is found in the approved list
  getApprovedTransaction(key) {
    let data = this.storage.getData();
    if (!data || !data.transactions) {
      return false;
    }
    let answer = data.transactions[key];
    if (!answer) {
      return false;
    }
    return true;
  }

  sign(message) {
    let kp = this.getKeyPair();
    if (!kp) {
      kp = KeyPair.fromRandom();
    }
    return SignedMessage.fromSigning(message, kp);
  }

  // If we already have permissions for this RequestPermission
  // message, return a Permission message saying so.
  // If we do not, wait until we do, before returning the message.
  async handleRequestPermission(host, requested) {
    let permissions = this.getPermissions(host);

    let popupURL = chrome.runtime.getURL("popup.html?request");

    if (hasPermission(permissions, requested)) {
      // The app already has the requested permissions
      return new Message("Permission", {
        permissions: permissions,
        popupURL: popupURL
      });
    }

    // Add a request for these permissions
    // The redux store is used only to manipulate our storage in a
    // consistent way
    let store = await Storage.makeStore();
    store.dispatch(requestPermission(host, requested));

    // Wait for the user to either accept or deny, or for ten minutes
    let start = new Date();
    while (true) {
      await sleep(500);
      let now = new Date();
      let ms = now.valueOf() - start.valueOf();
      if (ms > 1000 * 60 * 10) {
        break;
      }
      if (!this.storage.request) {
        break;
      }
    }

    permissions = this.getPermissions(host);
    if (hasPermission(permissions, requested)) {
      // The user granted the requested permissions
      return new Message("Permission", {
        permissions: permissions,
        popupURL: popupURL
      });
    } else {
      // The user rejected the requested permissions
      return null;
    }
  }

  // Prompt the user to accept or deny a currency transfer.
  async handleRequestSendCurrency(publicKey, amount) {
    let popupURL = chrome.runtime.getURL("popup.html?send");
    let store = await Storage.makeStore();
    let key = 't' + (new Date()).valueOf();
    store.dispatch(requestSendCurrency(key, publicKey, amount));

    // Wait for the user to either accept or deny, or for one minute
    let start = new Date();
    while (true) {
      await sleep(500);
      let now = new Date();
      let ms = now.valueOf() - start.valueOf();
      if (ms > 1000 * 60) {
        break;
      }
      if (!this.storage.request) {
        break;
      }
    }

    if (this.getApprovedTransaction(key)) {
      // Send!
      let client = this.newClient();
      await client.send(publicKey, amount);
      return new Message("TransactionApproved", {
        key: key,
        publicKey: publicKey,
        amount: amount,
        popupURL: popupURL
      })
    }
    
  }

  // Handles a message from an untrusted client.
  // Returns the message they should get back, or null if there is none.
  async handleUntrustedMessage(message, host) {
    let permissions = this.getPermissions(host);
    let client = this.newClient();

    console.log(host, "sent us a message:", message);

    switch (message.type) {
      case "RequestPermission":
        return await this.handleRequestPermission(host, message.permissions);

      case "Query":
        // Handle public key queries locally
        if (message.publicKey) {
          if (permissions.publicKey) {
            return new Message("Data", {
              publicKey: this.getKeyPair().getPublicKey()
            });
          }

          // Reject because we don't have the permissions
          return new Message("Error", { error: "Missing Query permission" });
        }

        let response = await this.sendMessage(message);
        return response;

      case "CreateBucket":
        let createPerm = {
          createBucket: [{ name: message.name, size: message.size }]
        };
        if (!hasPermission(permissions, createPerm)) {
          return new Message("Error", {
            error: "Missing CreateBucket permission"
          });
        }
        try {
          await client.createBucket(message.name, message.size);
        } catch (e) {
          return new Message("Error", { error: e.message });
        }
        return new Message("Data", {});

      case "UpdateBucket":
        let updatePerm = {
          updateBucket: [{ name: message.name }]
        };
        if (!hasPermission(permissions, updatePerm)) {
          return new Message("Error", {
            error: "Missing UpdateBucket permission"
          });
        }
        try {
          await client.updateBucket(message.name, message.magnet);
        } catch (e) {
          return new Message("Error", { error: e.message });
        }
        return new Message("Data", {});

      case "RequestSendCurrency":
        return await this.handleRequestSendCurrency(message.publicKey, message.amount);  

      default:
        console.log(
          "the client sent an unexpected message type:",
          message.type
        );
        return null;
    }
  }

  newClient(): ChainClient {
    let kp = this.getBestEffortKeyPair();
    return new ChainClient(kp, this.network);
  }

  // Sends a Message upstream, signing with our keypair.
  // Returns a promise for the response Message.
  async sendMessage(message) {
    let client = this.newClient();
    return await client.sendMessage(message);
  }

  // Sends a query message, given the query properties.
  // Returns a promise for a message - a data message if the query worked, an error
  // message if it did not.
  async query(properties) {
    let message = new Message("Query", properties);
    return this.sendMessage(message);
  }

  async getAccount() {
    let kp = this.getKeyPair();
    if (!kp) {
      return null;
    }
    let pk = kp.getPublicKey();
    let query = {
      account: pk
    };
    let response = await this.query(query);
    return response.accounts[pk];
  }

  // Fetches the balance for this account
  async balance() {
    let account = await this.getAccount();
    if (!account) {
      return 0;
    }
    return account.balance;
  }

  // Fetches the "sequence" for this account, which is the sequence id of the last
  // operation used.
  async sequence() {
    let account = await this.getAccount();
    if (!account) {
      return 0;
    }
    return account.sequence;
  }
}
