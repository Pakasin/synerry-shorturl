import { customAlphabet } from 'nanoid';

export const generateShortCode = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 6);

export const MAX_CODE_ATTEMPTS = 5;
