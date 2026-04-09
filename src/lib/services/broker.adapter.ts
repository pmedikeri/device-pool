import crypto from "crypto";
import { config } from "@/lib/config";

// ---------------------------------------------------------------------------
// BrokerAdapter — abstraction over remote-desktop connection brokers
// ---------------------------------------------------------------------------

export interface CreateConnectionParams {
  deviceId: string;
  hostname: string;
  protocol: "ssh" | "rdp" | "vnc";
  port: number;
  username?: string;
}

export interface ConnectionResult {
  brokerSessionId: string;
  connectionUrl: string;
}

export interface BrokerAdapter {
  createConnection(params: CreateConnectionParams): Promise<ConnectionResult>;
  destroyConnection(brokerSessionId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// GuacamoleMockAdapter — returns mock URLs for local development
// ---------------------------------------------------------------------------
//
// To integrate a real Apache Guacamole instance, replace the method bodies
// with REST API calls to the Guacamole backend:
//
//  createConnection:
//    1. POST /api/session/data/{{dataSource}}/connections
//       with a JSON body describing the connection (protocol, hostname, port,
//       username, password/key, etc.).
//    2. Retrieve the connection ID from the response.
//    3. Generate a Guacamole client URL:
//       `${config.guacamoleUrl}/#/client/${base64(connectionId + '\0' + 'c' + '\0' + dataSource)}`
//    4. Return { brokerSessionId: connectionId, connectionUrl }.
//
//  destroyConnection:
//    1. DELETE /api/session/data/{{dataSource}}/connections/{{brokerSessionId}}
//    2. Optionally kill the active tunnel via
//       DELETE /api/session/data/{{dataSource}}/activeConnections/{{tunnelId}}
//
// Authentication with Guacamole:
//    POST /api/tokens  { username, password } -> { authToken }
//    Pass authToken as query param or header on subsequent calls.
//    Use config.guacamoleAdminUser / config.guacamoleAdminPassword.
// ---------------------------------------------------------------------------

export class GuacamoleMockAdapter implements BrokerAdapter {
  async createConnection(params: CreateConnectionParams): Promise<ConnectionResult> {
    const brokerSessionId = crypto.randomUUID();

    // Guacamole client identifiers are base64-encoded:
    //   connectionId + NUL + type("c") + NUL + dataSource
    const identifier = Buffer.from(
      `${brokerSessionId}\0c\0mock`
    ).toString("base64");

    const connectionUrl = `${config.guacamoleUrl}/#/client/${encodeURIComponent(identifier)}`;

    return { brokerSessionId, connectionUrl };
  }

  async destroyConnection(_brokerSessionId: string): Promise<void> {
    // No-op for the mock adapter.
    // A real implementation would DELETE the Guacamole connection here.
  }
}
