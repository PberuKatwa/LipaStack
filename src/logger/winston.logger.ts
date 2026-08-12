import winston from 'winston';

import type { Request, Response } from 'express';

export class AppLogger {
  private logger: winston.Logger;

  constructor() {
    const customLevels = {
      levels: {
        error: 0,
        warn: 1,
        info: 2,
        httpreq: 3,
        debug: 4,
      },
      colors: {
        error: 'red',
        warn: 'yellow',
        info: 'green',
        httpreq: 'magenta',
        debug: 'blue',
      },
    };

    winston.addColors(customLevels.colors);

    this.logger = winston.createLogger({
      levels: customLevels.levels,
      level: 'debug',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(
          (entry: { level: string; message: unknown; [key: string]: unknown }): string => {
            const { level, message, timestamp, ...meta } = entry;
            const color = winston.format.colorize().colorize;
            const metaString = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';

            return `${color(level, level.toUpperCase())} ${String(timestamp)} : ${String(message)} ${metaString}`;
          },
        ),
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
      ],
    });
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.logger.error(message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(message, meta);
  }

  httpreq(message: string, meta?: Record<string, unknown>): void {
    this.logger.log('httpreq', message, meta);
  }

  logAPIStart(req: Request): void {
    this.httpreq('Request initiated', {
      method: req.method,
      url: req.originalUrl,
      timestamp: new Date().toISOString(),
    });
  }

  logAPIRequest(req: Request, res: Response, duration: number): void {
    this.httpreq('Request completed', {
      method: req.method,
      url: req.originalUrl,
      duration: `${duration} ms`,
      statusCode: res.statusCode,
    });
  }
}

export const logger = new AppLogger();
