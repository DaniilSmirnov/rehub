export enum DeviceState {
  ABSENT = 'absent',
  OFFLINE = 'offline',
  UNAUTHORIZED = 'unauthorized',
  PREPARING = 'preparing',
  BUSY = 'busy',
  AVAILABLE = 'available',
  USING = 'using',
  AUTOMATION = 'automation',
  /* Under automation by someone else: can be watched, not taken */
  AUTOMATED = 'automated',
  PRESENT = 'present',
  UNHEALTHY = 'unhealthy',
}
