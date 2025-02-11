import { produce } from 'immer'
import _, { now } from 'lodash'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { create } from 'zustand'
import { lerp } from '../../util/math/math'
import Toggle from '../components/Toggle'

export type PresetValueDescription =
  | { type: 'slider'; default: number }
  | { type: 'boolean'; default: boolean }
  | { type: 'string'; default: string }
  | { type: 'trigger'; default: undefined }
  | { type: 'list'; default: number[] }
  | {
      type: 'select'
      default: string
      options: string[]
      display: 'menu' | 'dropdown'
    }
  | { type: 'xy'; default: [number, number]; bounds: [number, number] }

export type Schema = Record<string, PresetValueDescription>
export type SchemaPreset<T extends Schema> = {
  [K in keyof T]: PresetValue<T[K]>
}
export type PresetValue<T extends PresetValueDescription> = T['default']
export type AppState<T extends Schema> = {
  schema: T
  preset: SchemaPreset<T>
  presets: SchemaPreset<T>[]
  currentPreset: number
}
export type PresetSocket<T extends Schema> = Socket<{}, SocketEvents<T>>
export type SocketEvents<T extends Schema> = {
  do: <T extends { type: 'encode'; info: { timestamp: number } }>(
    type: T['type'],
    info: T['info']
  ) => void
  get: <
    T extends {
      type: 'path'
      info: { relativePath: string }
      callback: (path: string) => void
    }
  >(
    type: T['type'],
    info: T['info'],
    callback: T['callback']
  ) => void
  load: (callback: (presets: AppState<T>['presets']) => void) => void
  save: (presets: AppState<T>['presets']) => void
  osc: (target: 'max' | 'td' | 'all', path: string, ...value: any[]) => void
}

const createPresetFromSchema = <T extends Schema>(
  schema: T
): SchemaPreset<T> => {
  const schemaPreset = {} as SchemaPreset<T>
  for (let key of Object.keys(schema)) {
    ;(schemaPreset as any)[key] = { value: schema[key].default }
  }
  return schemaPreset
}

const createStateFromSchema = <T extends Schema>(schema: T): AppState<T> => {
  return {
    schema,
    preset: createPresetFromSchema(schema),
    presets: [],
    currentPreset: 0
  }
}

type Store<T extends Schema> = ReturnType<typeof createStore<T>>

export const createStore = <T extends Schema>(schema: T) => {
  const initialState: AppState<T> = createStateFromSchema(schema)
  const useAppStore = create(() => initialState)

  const modify = (modifier: (state: AppState<T>) => void) =>
    useAppStore.setState(produce(modifier) as unknown)

  const setters = {
    savePreset: (index: number, socket: PresetSocket<T>) => {
      modify(state => {
        state.presets[index] = _.cloneDeep(state.preset)
        socket.emit('save', state.presets)
      })
    },
    deletePreset: (name: number, socket: PresetSocket<T>) => {
      modify(state => {
        state.presets.splice(name, 1)
        socket.emit('save', state.presets)
      })
    },
    loadPreset: (name: number, socket: PresetSocket<T>) => {
      const presets = useAppStore.getState()['presets']
      const currentPreset = useAppStore.getState()['preset']
      const newPreset = !presets[name]
        ? _.cloneDeep(currentPreset)
        : presets[name]

      setters.setPreset({ ...newPreset }, socket)

      modify(state => {
        state.currentPreset = name
      })
    },
    setPreset: (
      newPreset: Partial<SchemaPreset<T>>,
      socket: PresetSocket<T>,
      // when setting/getting these are useful for preventing infinite loops
      { commit = true, send: sendToMax = true } = {}
    ) => {
      if (sendToMax) {
        for (let key of Object.keys(newPreset)) {
          socket.emit('osc', 'all', key, newPreset[key])
        }
      }

      if (commit) {
        modify(state => {
          Object.assign(state.preset, newPreset)
        })
      }
    },
    set: (newState: Partial<AppState<T>>) => modify(() => newState)
  }
  const context = createContext<PresetSocket<T>>(null!)

  function PresetInput() {
    const allPresets = useAppStore(state => state.presets)
    const presetLength = useAppStore(state => state.presets.length)
    const currentPreset = useAppStore(state => state.currentPreset)
    const socket = useContext(context)

    useEffect(() => {
      console.log('new title', currentPreset)
    }, [currentPreset])

    return (
      <div className='w-[160px] h-full flex flex-col'>
        <div className='flex space-x-2 mb-2'>
          <button
            className='w-full bg-gray-600/50'
            onClick={() => {
              if (!currentPreset) return
              setters.savePreset(currentPreset, socket)
            }}>
            save
          </button>
          <button
            className='w-full bg-gray-600/50'
            onClick={() => {
              if (!currentPreset) return
              setters.deletePreset(currentPreset, socket)
            }}>
            delete
          </button>
        </div>

        <div className='flex flex-wrap *:aspect-square *:w-6 h-full w-[160px] overflow-auto'>
          {_.range(presetLength).map(i => (
            <button
              className={`rounded flex items-center justify-center m-1 ${
                currentPreset === i
                  ? 'bg-yellow-500 text-black'
                  : allPresets[i]
                  ? 'bg-gray-500 text-white'
                  : 'bg-gray-600/50 text-white'
              }`}
              onClick={() => {
                setters.loadPreset(i, socket)
              }}>
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    )
  }

  function PresetControl({ name }: { name: string }) {
    const socket = useContext(context)!
    const value: PresetValue<any> = useAppStore(
      state => state.preset[name as string]
    )
    const description: PresetValueDescription = useAppStore(
      state => state.schema[name as string]
    )

    switch (description.type) {
      case 'trigger':
        return (
          <button
            onClick={() => {
              setters.setPreset({ [name]: false } as any, socket, {
                commit: false
              })
            }}
            className={`border border-gray-700 mx-1`}>
            {name}
          </button>
        )
      case 'boolean':
        return (
          <button
            onClick={() => {
              setters.setPreset({ [name]: !value } as any, socket)
            }}
            className={`border border-gray-700 mx-1 ${
              value ? 'bg-gray-700' : ''
            }`}>
            {name}
          </button>
        )
      case 'select':
        return description.display === 'menu' ? (
          <div className='space-y-1'>
            <h3>{name}</h3>
            {(description.options as string[])!.map(item => (
              <button
                className={`block w-full text-left px-2 ${
                  value === item ? 'bg-yellow-500 text-black' : ''
                }`}
                onClick={() =>
                  setters.setPreset({ [name]: item } as any, socket)
                }
                key={item}
                value={item}>
                {item}
              </button>
            ))}
          </div>
        ) : description.display === 'dropdown' ? (
          <div>
            <h3>{name}</h3>
            <select
              value={value}
              onChange={ev => {
                setters.setPreset({ [name]: ev.target.value } as any, socket)
              }}>
              <option value=''>---</option>
              {description.options.map(val => (
                <option key={val} value={val}>
                  {val}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <></>
        )
      case 'slider':
        return (
          <div className='w-[50px] h-full flex flex-col items-center'>
            <h3 className='w-full text-center text-xs whitespace-nowrap !font-sans'>
              {name.slice(0, 8) + (name.length > 8 ? '...' : '')}
            </h3>
            <input
              type='range'
              orient='vertical'
              min={0}
              max={1}
              step={0.01}
              value={value as number}
              style={{
                // @ts-ignore
                appearance: 'slider-vertical'
              }}
              className='h-full w-[6px] accent-blue-200 rounded-lg'
              onChange={ev => {
                setters.setPreset(
                  { [name]: Number(ev.target.value) } as any,
                  socket
                )
              }}></input>
          </div>
        )
      case 'list':
        const listValue = value as number[]
        return (
          <div>
            <div className='w-full text-center text-sm font-bold'>{name}</div>
            <div className='flex *:mx-2'>
              {listValue.map(value => (
                <span>{value.toFixed(2)}</span>
              ))}
            </div>
          </div>
        )
      case 'string':
        return (
          <input
            className='w-[100px] text-sm'
            value={value}
            onChange={ev =>
              setters.setPreset({ [name]: ev.target.value } as any, socket)
            }></input>
        )
      case 'xy':
        return (
          <div
            className='h-[100px] w-[100px] rounded-lg border'
            onMouseMove={ev => {
              if (!ev.buttons) return

              console.log(
                (ev.clientX - ev.currentTarget.getBoundingClientRect().left) /
                  ev.currentTarget.clientWidth
              )
              const rect = ev.currentTarget.getBoundingClientRect()
              setters.setPreset(
                {
                  [name]: [
                    lerp(
                      0,
                      description.bounds[0],
                      (ev.clientX - rect.left) / rect.width
                    ),
                    lerp(
                      0,
                      description.bounds[1],
                      1 - (ev.clientY - rect.top) / rect.height
                    )
                  ]
                } as any,
                socket
              )
            }}></div>
        )
      default:
        return <></>
    }
  }

  function OscPresets() {
    const socket = useContext(context)
    let lastRecord = useRef(0)
    return (
      <>
        <div className='flex w-full overflow-auto space-x-2 h-[200px] items-center'>
          <PresetInput />
          <Toggle
            label='record'
            cb={state => {
              if (state) {
                const nowStr = now()
                socket.emit(
                  'get',
                  'path',
                  {
                    relativePath: `./exports`
                  },
                  path => {
                    socket.emit(
                      'osc',
                      'td',
                      '/record/filename',
                      path + `/${nowStr}.mov`
                    )
                    socket.emit(
                      'osc',
                      'max',
                      '/record/filename',
                      `open`,
                      `${path}/${nowStr}.wav`
                    )
                    lastRecord.current = nowStr
                    window.setTimeout(
                      () => socket.emit('osc', 'all', '/record/status', 1),
                      500
                    )
                  }
                )
              } else {
                console.log('stop')
                socket.emit('osc', 'all', '/record/status', 0)
                socket.emit('do', 'encode', {
                  timestamp: lastRecord.current
                })
              }
            }}
          />
          {Object.keys(schema)
            .sort()
            .map(key => (
              <PresetControl name={key} key={key} />
            ))}
        </div>
      </>
    )
  }

  function OscFrame({ children }: React.PropsWithChildren) {
    const [socket, setSocket] = useState<PresetSocket<T>>()

    useEffect(() => {
      const socket: PresetSocket<T> = io()
      setSocket(socket)

      socket.emit('load', presets => {
        setters.set({
          presets
        })
      })

      return () => {
        socket.close()
      }
    }, [])

    return (
      socket && <context.Provider value={socket}>{children}</context.Provider>
    )
  }
  const useSocket = () => useContext(context)
  return { OscPresets, OscFrame, useSocket }
}
