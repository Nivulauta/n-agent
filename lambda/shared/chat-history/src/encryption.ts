/**
 * KMS Encryption utilities for chat history
 */

import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';

export class EncryptionService {
    private kmsClient: KMSClient;
    private kmsKeyId: string;

    constructor(kmsKeyId: string, region: string = 'us-east-1') {
        this.kmsClient = new KMSClient({ region });
        this.kmsKeyId = kmsKeyId;
    }

    /**
     * Encrypt content using KMS
     */
    async encrypt(plaintext: string): Promise<string> {
        const command = new EncryptCommand({
            KeyId: this.kmsKeyId,
            Plaintext: Buffer.from(plaintext, 'utf-8'),
        });

        const response = await this.kmsClient.send(command);

        if (!response.CiphertextBlob) {
            throw new Error('KMS encryption failed: no ciphertext returned');
        }

        // Return base64-encoded ciphertext
        return Buffer.from(response.CiphertextBlob).toString('base64');
    }

    /**
     * Decrypt content using KMS
     */
    async decrypt(ciphertext: string): Promise<string> {
        const command = new DecryptCommand({
            CiphertextBlob: Buffer.from(ciphertext, 'base64'),
        });

        const response = await this.kmsClient.send(command);

        if (!response.Plaintext) {
            throw new Error('KMS decryption failed: no plaintext returned');
        }

        return Buffer.from(response.Plaintext).toString('utf-8');
    }
}
