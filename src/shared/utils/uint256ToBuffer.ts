export const uint256ToBuffer = (value: bigint): Buffer => Buffer.from(value.toString(16).padStart(64, '0'), 'hex');
