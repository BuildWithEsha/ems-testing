// Performance monitoring utility for EMS application
class PerformanceMonitor {
  constructor() {
    this.metrics = {};
    this.isEnabled = process.env.NODE_ENV === 'development';
  }

  // Start timing a performance metric
  startTiming(label) {
    if (!this.isEnabled) return;
    this.metrics[label] = {
      startTime: performance.now(),
      endTime: null,
      duration: null
    };
  }

  // End timing and calculate duration
  endTiming(label) {
    if (!this.isEnabled || !this.metrics[label]) return;
    
    const metric = this.metrics[label];
    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;
    
    // Log slow operations
    if (metric.duration > 1000) {
      console.warn(`🐌 Slow operation detected: ${label} took ${metric.duration.toFixed(2)}ms`);
    } else if (metric.duration > 500) {
      console.info(`⚠️  Moderate operation: ${label} took ${metric.duration.toFixed(2)}ms`);
    } else {
      console.log(`✅ Fast operation: ${label} took ${metric.duration.toFixed(2)}ms`);
    }
    
    return metric.duration;
  }

  // Measure API call performance
  measureApiCall(url, fetchPromise) {
    if (!this.isEnabled) return fetchPromise;
    
    const label = `API: ${url}`;
    this.startTiming(label);
    
    return fetchPromise
      .then(response => {
        this.endTiming(label);
        return response;
      })
      .catch(error => {
        this.endTiming(label);
        throw error;
      });
  }

  // Get performance report
  getReport() {
    if (!this.isEnabled) return {};
    
    const report = {};
    Object.keys(this.metrics).forEach(label => {
      const metric = this.metrics[label];
      if (metric.duration !== null) {
        report[label] = {
          duration: metric.duration,
          startTime: metric.startTime,
          endTime: metric.endTime
        };
      }
    });
    
    return report;
  }

  // Clear metrics
  clear() {
    this.metrics = {};
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

// Helper functions for common operations
export const measureTaskLoading = (fetchPromise) => {
  return performanceMonitor.measureApiCall('Task Loading', fetchPromise);
};

export const measureTimerOperation = (operation, fetchPromise) => {
  return performanceMonitor.measureApiCall(`Timer ${operation}`, fetchPromise);
};

export const measureTaskDetails = (taskId, fetchPromise) => {
  return performanceMonitor.measureApiCall(`Task Details ${taskId}`, fetchPromise);
};

export default performanceMonitor;

