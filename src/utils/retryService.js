export class RetryService {
  static async execute(fn, times = 2, delayMs = 1000) {
    let lastError;

    for (let i = 0; i < times; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i < times - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError;
  }
}
