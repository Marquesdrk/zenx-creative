import { createHmac, timingSafeEqual } from "node:crypto";
import { getMetaAppSecret } from "./config";

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64");
}

/** Verifica e decodifica o `signed_request` enviado pela Meta nos callbacks de "Deauthorize"
 *  e "Data Deletion Request" (configurados nas configurações do app — ver
 *  docs/META_INTEGRATION_SETUP.md). Lança erro se a assinatura não bater com META_APP_SECRET
 *  — nunca confie no payload sem verificar, qualquer um pode POSTar nesse endpoint. */
export function parseSignedRequest<T = Record<string, unknown>>(signedRequest: string): T {
  const [encodedSig, encodedPayload] = signedRequest.split(".", 2);
  if (!encodedSig || !encodedPayload) {
    throw new Error("signed_request malformado.");
  }

  const expectedSig = createHmac("sha256", getMetaAppSecret()).update(encodedPayload).digest();
  const actualSig = base64UrlDecode(encodedSig);
  if (actualSig.length !== expectedSig.length || !timingSafeEqual(actualSig, expectedSig)) {
    throw new Error("Assinatura do signed_request inválida.");
  }

  return JSON.parse(base64UrlDecode(encodedPayload).toString("utf8")) as T;
}
