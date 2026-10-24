import http from 'http';
import { logger } from '../logger.js';

export class RestSpeechClient {
  constructor(port = 7777) {
    this.port = port;
    this.host = '127.0.0.1';
  }

  async isReady() {
    return new Promise((resolve) => {
      const req = http.get(
        {
          host: this.host,
          port: this.port,
          path: '/health',
          timeout: 2000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              resolve({ ready: Boolean(parsed.ready), error: parsed.error, engine: parsed.engine });
            } catch {
              resolve({ ready: false, error: 'Malformed response' });
            }
          });
        }
      );
      req.on('error', (err) => resolve({ ready: false, error: err.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ready: false, error: 'Health check timed out' });
      });
    });
  }

  async transcribe(audioBuffer) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: this.host,
          port: this.port,
          path: '/transcribe',
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': audioBuffer.length,
          },
          timeout: 30000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve({
                  text: parsed.text || '',
                  language: parsed.language || 'en',
                  duration: parsed.duration || 0,
                  words: parsed.words || [],
                });
              } else {
                reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
              }
            } catch (err) {
              reject(new Error(`Failed to parse REST response: ${err.message}`));
            }
          });
        }
      );

      req.on('error', (err) => reject(new Error(`REST request error: ${err.message}`)));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('REST transcription timed out after 30s'));
      });

      req.write(audioBuffer);
      req.end();
    });
  }

  async listEngines() {
    return new Promise((resolve) => {
      http.get({ host: this.host, port: this.port, path: '/engines', timeout: 2000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data).engines || []);
          } catch {
            resolve([]);
          }
        });
      }).on('error', () => resolve([]));
    });
  }

  async setEngine(engineId) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ engine_id: engineId });
      const req = http.request({
        host: this.host,
        port: this.port,
        path: '/engine',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}
