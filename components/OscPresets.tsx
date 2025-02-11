import _, { now } from 'lodash'
import { useEffect, useRef } from 'react'
import {
  PresetValue,
  PresetValueDescription,
  Schema,
  setters,
  useAppStore
} from '../modules/store'
import { useSocket } from '../../../src/controls/context'
import { lerp, scale } from '../../util/math/math'
import Toggle from './Toggle'

function PresetInput() {
  const allPresets = useAppStore(state => state.presets)
  const presetLength = useAppStore(state => state.presets.length)
  const currentPreset = useAppStore(state => state.currentPreset)
  const socket = useSocket()!

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

function PresetControl({ name }: { name: keyof Schema }) {
  const socket = useSocket()!
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
            setters.setPreset({ [name as string]: false }, socket, {
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
            setters.setPreset({ [name as string]: !value }, socket)
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
                setters.setPreset({ [name as string]: item }, socket)
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
              setters.setPreset({ [name as string]: ev.target.value }, socket)
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
                { [name as string]: Number(ev.target.value) },
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
            setters.setPreset({ [name as string]: ev.target.value }, socket)
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
                [name as string]: [
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
              },
              socket
            )
          }}></div>
      )
    default:
      return <></>
  }
}

export default function OscPresets({ schema }: { schema: Schema }) {
  const socket = useSocket()
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
