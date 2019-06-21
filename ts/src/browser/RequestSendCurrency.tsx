// A screen for an app to request permissions from the user.

import * as React from "react";
import Button from "@material-ui/core/Button";

import Styles from "./Styles";

export default class RequestSendCurrency extends React.Component<any, any> {
  // props.publicKey holds the target address
  // props.amount has the amount
  constructor(props) {
    super(props);
  }

  render() {
    return (
      <div style={Styles.popup}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            wordWrap: "break-word",
            width: "100%",
            flex: 3
          }}
        >
          <h1>Send Currency?</h1>
          <h2>{this.props.host} request to send:</h2>
          <ol>
            <li><b>Amount: </b> {this.props.amount}</li>
            <li><b>To: </b> {this.props.publicKey}</li>
          </ol>
        </div>

        <div
          style={{
            flex: 2,
            display: "flex",
            flexDirection: "column",
            width: "100%",
            justifyContent: "space-evenly"
          }}
          onSubmit={event => {
            event.preventDefault();
          }}
        >
          <Button
            variant="contained"
            color="primary"
            onClick={() => this.props.accept()}
          >
            Accept
          </Button>
          <Button
            variant="contained"
            color="default"
            onClick={() => this.props.deny()}
          >
            Deny
          </Button>
        </div>
      </div>
    );
  }
}
