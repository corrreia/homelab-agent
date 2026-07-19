import ssh2 from 'ssh2'

export interface AgentKeyPair {
  /** OpenSSH-format private key (PEM). Encrypted before it ever hits the DB. */
  privateKey: string
  /** authorized_keys line: `ssh-ed25519 <base64> <comment>`. Safe to display. */
  publicKey: string
}

/**
 * Generate the agent's SSH identity: an ed25519 keypair. ssh2's generator hands back an
 * OpenSSH private key and an `ssh-<type> <base64>` public key, both formats ssh2 can then
 * use for authentication — we just normalise a trailing comment onto the public line.
 */
export function generateAgentKeyPair(comment = 'homelab-agent'): AgentKeyPair {
  const { private: privateKey, public: publicKey } = ssh2.utils.generateKeyPairSync('ed25519')
  const [type, base64] = publicKey.trim().split(/\s+/)
  return {
    privateKey,
    publicKey: `${type} ${base64} ${comment}`,
  }
}
