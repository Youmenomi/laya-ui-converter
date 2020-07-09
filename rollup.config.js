import json from '@rollup/plugin-json'
import filesize from 'rollup-plugin-filesize'
import commonjs from '@rollup/plugin-commonjs'
import resolve from '@rollup/plugin-node-resolve'
import { terser } from 'rollup-plugin-terser'
import babel from '@rollup/plugin-babel'
import { bin } from './package.json'

const extensions = ['.js', '.jsx', '.ts', '.tsx']

/**
 * @typedef  {import('rollup').OutputOptions} OutputOptions
 */

/**
 * @param {OutputOptions} output
 * @param {rollup.} withMin
 */
const build = (input, output, withMin = false) => {
  const config = {
    input,
    external: [
      'yargs',
      'fs-extra',
      'chalk',
      'path',
      'replace-string',
      'async',
      'listr2',
      'execa',
      'xml2js',
      'resolve-global',
      'read-pkg',
    ],
    plugins: [
      json(),
      resolve({ extensions }),
      commonjs(),
      babel({ extensions, include: ['src/**/*'], babelHelpers: 'bundled' }),
    ],
    output: [],
  }

  /**
   * @type {OutputOptions}
   */
  const copy = { ...output }
  if (withMin) {
    copy.file = copy.file.replace(/.js$/, '.min.js')
    config.plugins.push(terser())
  } else {
    copy.sourcemap = true
  }
  config.plugins.push(filesize())
  config.output.push(copy)

  return withMin ? [build(output), config] : config
}

export default [].concat(
  build('./src/index.ts', {
    banner: `#!/usr/bin/env node
    `,
    file: bin['laya-ui-converter'],
    format: 'cjs',
  })
)
