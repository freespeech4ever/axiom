// Redux actions
import KeyPair from "../iso/KeyPair";

export const DENY_PERMISSION = "DENY_PERMISSION";
export const GRANT_PERMISSION = "GRANT_PERMISSION";
export const REQUEST_PERMISSION = "REQUEST_PERMISSION";
export const LOAD_FROM_STORAGE = "LOAD_FROM_STORAGE";
export const LOG_OUT = "LOG_OUT";
export const NEW_KEY_PAIR = "NEW_KEY_PAIR";
export const NEW_PASSWORD = "NEW_PASSWORD";
export const REQUEST_SEND_CURRENCY = "REQUEST_SEND_CURRENCY";
export const APPROVE_TRANSACTION = "APPROVE_TRANSACTION";

export function denyPermission() {
  return {
    type: DENY_PERMISSION
  };
}

export function grantPermission(host, permissions) {
  return {
    type: GRANT_PERMISSION,
    host: host,
    permissions: permissions
  };
}

export function requestPermission(host, permissions) {
  return {
    type: REQUEST_PERMISSION,
    host: host,
    permissions: permissions
  };
}

export function logOut() {
  return { type: LOG_OUT };
}

export function loadFromStorage(storage) {
  let data = storage.getData() || {};

  let action = {
    type: LOAD_FROM_STORAGE,
    keyPair: data.keyPair || null,
    password: storage.password,
    permissions: data.permissions || {},
    request: storage.request,
    transactions: storage.transactions
  };

  return action;
}

export function newKeyPair(kp) {
  return {
    type: NEW_KEY_PAIR,
    keyPair: kp
  };
}

export function newPassword(password) {
  return {
    type: NEW_PASSWORD,
    password: password
  };
}

export function requestSendCurrency(key, publicKey, amount) {
  return {
    type: REQUEST_SEND_CURRENCY,
    key: key,
    publicKey: publicKey,
    amount: amount
  }
}

export function sendCurrency(key, publicKey, amount) {
  return {
    type: APPROVE_TRANSACTION,
    key: key,
    publicKey: publicKey,
    amount: amount
  }
}