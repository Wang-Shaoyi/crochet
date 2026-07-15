let counter = 0

export function createId(prefix = 'shape') {
  counter += 1
  return `${prefix}-${Date.now()}-${counter}`
}
