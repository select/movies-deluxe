/**
 * Consistent logging utilities for scrapers
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS',
}

const colors = {
  DEBUG: '\x1b[36m', // Cyan
  INFO: '\x1b[34m', // Blue
  WARN: '\x1b[33m', // Yellow
  ERROR: '\x1b[31m', // Red
  SUCCESS: '\x1b[32m', // Green
  RESET: '\x1b[0m',
}

class Logger {
  private context: string

  constructor(context: string) {
    this.context = context
  }

  private log(level: LogLevel, message: string, ...args: any[]) {
    const timestamp = new Date().toISOString()
    const color = colors[level]
    const reset = colors.RESET
    console.log(`${color}[${timestamp}] [${this.context}] ${level}:${reset} ${message}`, ...args)
  }

  debug(message: string, ...args: any[]) {
    this.log(LogLevel.DEBUG, message, ...args)
  }

  info(message: string, ...args: any[]) {
    this.log(LogLevel.INFO, message, ...args)
  }

  warn(message: string, ...args: any[]) {
    this.log(LogLevel.WARN, message, ...args)
  }

  error(message: string, ...args: any[]) {
    this.log(LogLevel.ERROR, message, ...args)
  }

  success(message: string, ...args: any[]) {
    this.log(LogLevel.SUCCESS, message, ...args)
  }
}

export function createLogger(context: string): Logger {
  return new Logger(context)
}
