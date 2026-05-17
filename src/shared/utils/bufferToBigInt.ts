export const bufferToBigInt = (buffer: Buffer): bigint => BigInt(`0x${buffer.toString('hex')}`)
