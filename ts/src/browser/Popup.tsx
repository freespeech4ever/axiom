// The root to display in the extension popup.

import * as React from "react";
import { connect } from "react-redux";
import Button from "@material-ui/core/Button";

import KeyPair from "../iso/KeyPair";
import Login from "./Login";
import NewPassword from "./NewPassword";
import RequestPermission from "./RequestPermission";
import RequestSendCurrency from "./RequestSendCurrency";
import Status from "./Status";
import Storage from "./Storage";
import TrustedClient from "./TrustedClient";

import {
  loadFromStorage,
  logOut,
  newKeyPair,
  newPassword,
  denyPermission,
  grantPermission,
  sendCurrency,
  REQUEST_PERMISSION,
  REQUEST_SEND_CURRENCY
} from "./Actions";

class Popup extends React.Component<any, any> {
  constructor(props) {
    super(props);
  }

  logOut() {
    this.props.dispatch(logOut());
  }

  newKeyPair(kp) {
    this.props.dispatch(newKeyPair(kp));
  }

  // Sets a new password for the already-existent keypair
  newPassword(password) {
    this.props.dispatch(newPassword(password));
  }

  // Closes the page if it ends in ?request or ?send
  finishRequest() {
    let parts = window.location.href.split("?");
    if (parts.length == 2 && (parts[1] == "request" || parts[1] == "send")) {
      window.close();
    }
  }

  // Tries to load a stored keypair given the password that protects it.
  // Returns whether the password was valid
  async checkPassword(password) {
    let storage = await Storage.get();
    let ok = storage.checkPassword(password);
    if (!ok) {
      console.log("bad password:", password);
      return false;
    }
    this.props.dispatch(loadFromStorage(storage));
    return true;
  }

  render() {
    let style: any = {
      display: "flex",
      alignSelf: "stretch",
      flexDirection: "column",
      justifyContent: "center"
    };
    console.log(this.props);
    if (!this.props.keyPair) {
      // Show the login screen
      return (
        <div style={style}>
          <Login popup={this} />
        </div>
      );
    }
    if (!this.props.password) {
      // They have a keypair but need to create a password.
      // Show the new-password screen
      return (
        <div style={style}>
          <NewPassword popup={this} />
        </div>
      );
    }
    if (this.props.request) {
      let host = this.props.request.host;
      let permissions = this.props.request.permissions;
      // The app is requesting permissions
      return (
        <div style={style}>
          <RequestPermission
            host={host}
            permissions={permissions}
            accept={() => {
              this.props.dispatch(grantPermission(host, permissions));
              this.finishRequest();
            }}
            deny={() => {
              this.props.dispatch(denyPermission());
              this.finishRequest();
            }}
          />
        </div>
      );
    }

    if (this.props.transactions) {
      let key = this.props.request.key;
      let publicKey = this.props.request.publicKey;
      let amount = this.props.request.amount;
      // The app is requesting to send currency
      return (
        <div style={style}>
          <RequestSendCurrency
            publicKey={publicKey}
            amount={amount}
            accept={() => {
              this.props.dispatch(sendCurrency(key, publicKey, amount));
              this.finishRequest();              
            }}
            deny={() => {
              this.finishRequest();
            }}
          />
        </div>
      )

    }

    // We have permissions for an account, so show its status
    return (
      <div style={style}>
        <Status popup={this} keyPair={this.props.keyPair} />
      </div>
    );
  }
}

function mapStateToProps(state) {
  return {
    password: state.password,
    keyPair: state.keyPair,
    request: state.request
  };
}

export default connect(mapStateToProps)(Popup);
