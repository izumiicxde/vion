const inFlightRequests = new Map();

export const getInFlight = (fingerprint) => inFlightRequests.get(fingerprint);
export const setInFlight = (fingerprint, promise) =>
  inFlightRequests.set(fingerprint, promise);
export const deleteInFlight = (fingerprint) => inFlightRequests.delete(fingerprint);
