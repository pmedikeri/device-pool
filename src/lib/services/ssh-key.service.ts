import { Client } from "ssh2";
import { decrypt } from "@/lib/crypto";

const KEY_MARKER = "# device-pool-managed";

export const SshKeyService = {
  /**
   * Add a user's public key to a device's authorized_keys.
   * Uses the device's stored SSH credentials to connect.
   */
  async addKey(params: {
    host: string;
    port: number;
    username: string;
    encryptedPassword: string;
    publicKey: string;
    userId: string;
  }): Promise<void> {
    const password = decrypt(params.encryptedPassword);
    const taggedKey = `${params.publicKey.trim()} ${KEY_MARKER}:${params.userId}`;

    const cmd = [
      "mkdir -p ~/.ssh",
      "chmod 700 ~/.ssh",
      "touch ~/.ssh/authorized_keys",
      "chmod 600 ~/.ssh/authorized_keys",
      // Remove any existing key for this user (idempotent)
      `grep -v '${KEY_MARKER}:${params.userId}' ~/.ssh/authorized_keys > ~/.ssh/authorized_keys.tmp 2>/dev/null || true`,
      "mv ~/.ssh/authorized_keys.tmp ~/.ssh/authorized_keys",
      // Add the key
      `echo '${taggedKey}' >> ~/.ssh/authorized_keys`,
    ].join(" && ");

    await execSsh({ host: params.host, port: params.port, username: params.username, password }, cmd);
  },

  /**
   * Remove a user's public key from a device's authorized_keys.
   */
  async removeKey(params: {
    host: string;
    port: number;
    username: string;
    encryptedPassword: string;
    userId: string;
  }): Promise<void> {
    const password = decrypt(params.encryptedPassword);

    const cmd = [
      `grep -v '${KEY_MARKER}:${params.userId}' ~/.ssh/authorized_keys > ~/.ssh/authorized_keys.tmp 2>/dev/null || true`,
      "mv ~/.ssh/authorized_keys.tmp ~/.ssh/authorized_keys",
    ].join(" && ");

    await execSsh({ host: params.host, port: params.port, username: params.username, password }, cmd);
  },
};

function execSsh(
  conn: { host: string; port: number; username: string; password: string },
  command: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    let output = "";

    client
      .on("ready", () => {
        client.exec(command, (err, stream) => {
          if (err) { client.end(); reject(err); return; }
          stream
            .on("data", (data: Buffer) => { output += data.toString(); })
            .on("close", (code: number) => {
              client.end();
              if (code === 0) resolve(output);
              else reject(new Error(`SSH command exited with code ${code}: ${output}`));
            });
          stream.stderr.on("data", (data: Buffer) => { output += data.toString(); });
        });
      })
      .on("error", (err) => reject(err))
      .connect({
        host: conn.host,
        port: conn.port,
        username: conn.username,
        password: conn.password,
        readyTimeout: 10000,
      });
  });
}
