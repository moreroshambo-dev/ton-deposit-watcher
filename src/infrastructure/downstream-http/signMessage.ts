import crypto, { type KeyLike, type SignJsonWebKeyInput, type SignKeyObjectInput, type SignPrivateKeyInput } from "node:crypto";

export function signMessage(
  privateKeyPem: KeyLike | SignKeyObjectInput | SignPrivateKeyInput | SignJsonWebKeyInput,
  payload: unknown,
): string {
  const normalizedPrivateKey =
    typeof privateKeyPem === "string"
      ? privateKeyPem.replace(/\\n/g, "\n")
      : privateKeyPem;

  const signature = crypto.sign(
    null,
    Buffer.from(JSON.stringify(payload)),
    normalizedPrivateKey,
  );

  return signature.toString("base64");
}