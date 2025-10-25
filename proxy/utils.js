import crypto from "crypto";

export const generateFingerprint = (req) => {
  const { method, originalUrl, body } = req;
  const bodyString = body ? JSON.stringify(body) : "";
  return crypto
    .createHash("sha256")
    .update(method + originalUrl + bodyString)
    .digest("hex");
};
