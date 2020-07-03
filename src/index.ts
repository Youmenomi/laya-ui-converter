import path from 'path';
import { cosmiconfig } from 'cosmiconfig';
import yargs from 'yargs';
import fs from 'fs-extra';
import chalk from 'chalk';
import replaceString from 'replace-string';
import dedent from 'ts-dedent';
import { eachOf } from 'async';
import { Listr, ListrTask } from 'listr2';
import { name } from '../package.json';

// eslint-disable-next-line no-console
const Log = console.log;

const { argv, showHelp } = yargs
  // .alias('v', 'version')
  // .alias('h', 'help')
  .options({
    file: {
      alias: 'f',
      type: 'string',
      describe: 'The path of the file to be converted.',
    },
    output: {
      alias: 'o',
      type: 'string',
      describe: 'The path to place converted files.',
    },
    config: {
      alias: 'c',
      type: 'string',
      describe: 'The path to the config file.',
    },
    noclean: {
      type: 'boolean',
      describe: 'Avoid cleanup before output.',
      default: false,
    },
    verbose: {
      alias: 'v',
      type: 'count',
      describe: 'Logging Levels.',
    },
  });

const DEFAULT_CONFIG = {};

(async () => {
  try {
    let config: Partial<typeof argv> = { ...DEFAULT_CONFIG };
    const explorer = cosmiconfig(name);
    const result = await explorer.search();
    if (result && !result.isEmpty) config = { ...config, ...result };
    config = { ...config, ...argv };
    if (!config.file) {
      showHelp();
      throw new Error(
        'Please provide the file path to be converted. Config it or use the -f options.'
      );
    }
    if (!config.output) {
      config.output = path.dirname(config.file);
    }

    let content: string;
    let modules: string[];
    let banner: string;
    const namespaces: string[] = [];
    const imports: string[] = [];

    Log(
      `💫 Converting ${chalk.bold.cyan(
        `${config.file} → ${config.output}/...`
      )}`
    );
    const tasks = new Listr([
      subError({
        title: 'Parsing',
        task: async () => {
          content = await fs.readFile(config.file, 'utf8');
          modules = content.split('\nexport module ');
          banner = modules
            .shift()
            .replace(
              'import View = Laya.View;\nimport Dialog = Laya.Dialog;\nimport Scene = Laya.Scene;\n',
              ''
            );

          modules.forEach((module, i) => {
            const start = module.indexOf(' {\n');
            const end = module.lastIndexOf('}');
            namespaces.push(module.substring(0, start));
            modules[i] = module.substring(start + 2, end);
          });

          modules.forEach((module, i) => {
            let im = '';
            const currNs = namespaces[i];
            namespaces.forEach((ns) => {
              const search = `: ${ns}.`;
              if (currNs !== ns && module.includes(search)) {
                const names = [];
                let start = module.indexOf(search);
                while (start >= 0) {
                  const end = module.indexOf('\n', start);
                  let name = module.substring(start + search.length, end);
                  name = replaceString(name, ';', '');
                  if (!names.includes(name)) names.push(name);
                  start = module.indexOf(search, end);
                }

                im += `import { ${names.join(', ')} } from '${path.relative(
                  ns2path(currNs),
                  ns2path(ns)
                )}';\n`;
              }
              module = replaceString(module, search, ': ');
            });

            modules[i] = module;
            imports[i] = im;
          });
        },
      }),
      subError({
        title: 'Cleanup',
        task: async () => {
          await fs.remove(
            path.join(config.output, namespaces[0].split('.')[0])
          );
        },
        skip: () => config.noclean,
      }),
      subError({
        title: 'output',
        task: async () => {
          await eachOf(modules, async (_module, i, cb) => {
            await fs.outputFile(
              path.join(config.output, ...namespaces[i].split('.'), 'index.ts'),
              dedent(imports[i] + banner + modules[i])
            );
            if (cb) cb();
          });
        },
      }),
    ]);
    await tasks.run();

    Log(`✨${chalk.bold('Done!')}`);
  } catch (error) {
    Log(chalk.bold.red(error));
  }
})();

function ns2path(ns: string) {
  return replaceString(ns, '.', '/');
}

function subError(listrTask: ListrTask) {
  return {
    title: listrTask.title,
    task: (_ctx, task): Listr => task.newListr([listrTask]),
  } as ListrTask;
}
