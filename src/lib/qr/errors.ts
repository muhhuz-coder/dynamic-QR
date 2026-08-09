export class QrNotFoundError extends Error {
  constructor(qrName: string) {
    super(`QR code not found: ${qrName}`);
    this.name = 'QrNotFoundError';
  }
}
