type GlobalSettings = {}
export type BrushSettings =
  | {
      type: 'slider'
      default: number
      value: number
      clamp?: [number | false, number | false]
      exponent?: number
    }
  | { type: 'string'; default: string; value: string }
  | {
      type: 'xy'
      default: [number, number]
      value: [number, number]
      clampX?: [number | false, number | false]
      clampY?: [number | false, number | false]
      exponent?: number
    }
type Config = GlobalSettings & BrushSettings
export const createValue = <T extends BrushSettings['type']>(
  config: Omit<Config, 'value'> & { type: T }
) => {
  config['value'] = config.default
  return config as Config & { type: T }
}
