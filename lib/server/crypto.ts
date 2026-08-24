import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

// Criptografia simétrica para segredos em repouso (tokens de acesso da Meta). SQLite não tem
// um equivalente ao pgcrypto/Vault do Supabase, então isso substitui aquele papel: o access
// token nunca é gravado em texto puro no banco, só o resultado de encryptSecret() abaixo.
// A chave nunca sai do processo do servidor — nada aqui é importado por código de cliente.

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12; // recomendado para GCM

function getKey(): Buffer {
  const raw = process.env.META_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "META_TOKEN_ENCRYPTION_KEY não definida — necessária para criptografar tokens da Meta. " +
        "Gere uma com `openssl rand -base64 32` e defina em .env.local (veja .env.local.example)."
    );
  }
  // Aceita uma chave base64 de 32 bytes "de verdade" (recomendado); se vier outra coisa
  // (string qualquer), deriva 32 bytes determinísticos via SHA-256 em vez de falhar —
  // funciona, mas o ideal é sempre gerar a chave com openssl como documentado.
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;
  return createHash("sha256").update(raw, "utf8").digest();
}

export function isEncryptionConfigured(): boolean {
  return Boolean(process.env.META_TOKEN_ENCRYPTION_KEY);
}

/** Criptografa uma string sensível (ex.: access token de Página/Instagram) para persistir no
 *  banco. Formato: `<iv base64>.<authTag base64>.<ciphertext base64>`. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(".");
}

/** Reverte encryptSecret(). Lança erro se a chave estiver errada ou o payload corrompido —
 *  isso é intencional (GCM autentica o conteúdo, não decripta "quase certo" silenciosamente). */
export function decryptSecret(payload: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Payload criptografado em formato inválido.");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
