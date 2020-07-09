import path from 'path';
import yargs from 'yargs';
import fs from 'fs-extra';
import chalk from 'chalk';
import replaceString from 'replace-string';
import { eachOf } from 'async';
import { Listr, ListrTask } from 'listr2';
import execa from 'execa';
import xml2js from 'xml2js';
import readPkg from 'read-pkg';
import resolveGlobal from 'resolve-global';
import { name } from '../package.json';

// eslint-disable-next-line no-console
const Log = console.log;

const GUARANTEE = ['1.6.9'];

const { argv } = yargs
  // .alias('v', 'version')
  // .alias('h', 'help')
  .options({
    workspace: {
      alias: 'w',
      type: 'string',
      describe: 'Incoming workspace path.',
      default: './',
    },
    clear: {
      alias: 'c',
      type: 'boolean',
      describe: 'Clear will delete old ui code file.',
      default: true,
    },
    skipUI: {
      alias: 's',
      type: 'boolean',
      describe: 'Skip the step of Generating ui code files.',
      default: false,
    },
    globalLayaCmd: {
      alias: 'g',
      type: 'boolean',
      describe: 'Use globally layaair2-cmd package.',
      default: false,
    },
    // verbose: {
    //   alias: 'v',
    //   type: 'count',
    //   describe: 'Logging Levels.',
    // },
  });

(async () => {
  try {
    let globalLayaCmdPath: string;
    if (argv.globalLayaCmd) {
      const f = resolveGlobal.silent('layaair2-cmd');
      if (f) await checkLayaCmd((globalLayaCmdPath = path.dirname(f)));
      else
        throw new Error(
          'First install layaair2-cmd globally to use the -g option.'
        );
    } else {
      try {
        await checkLayaCmd('./node_modules/layaair2-cmd');
      } catch (error) {
        if (error.code === 'ENOENT') {
          throw new Error(
            'First install layaair2-cmd locally or use global layaair2-cmd with the -g option.'
          );
        } else {
          throw error;
        }
      }
    }

    let codeExportPath: string;
    let output: string;
    let file: string;
    let content: string;
    let modules: string[];
    let banner: string;
    const namespaces: string[] = [];
    const imports: string[] = [];

    Log(`💫${name}`);
    const tasks = new Listr([
      subError({
        title: 'Load workspace',
        task: async () => {
          const laya = await xml2js.parseStringPromise(
            await fs.readFile(path.join(argv.workspace, 'laya/.laya'), 'utf8')
          );
          codeExportPath = String(laya.project.codeExportPath).trim();
          output = path.join(argv.workspace, codeExportPath);
          file = path.join(output, 'layaMaxUI.ts');
        },
      }),
      subError({
        title: 'Generate ui code files',
        task: async () => {
          const layaCmdArgs = ['ui', '-d', '-w', path.resolve(argv.workspace)];
          if (argv.clear) layaCmdArgs.push('-c');
          await execa.node(
            globalLayaCmdPath
              ? `${globalLayaCmdPath}/layaair2-cmd.js`
              : './node_modules/layaair2-cmd/layaair2-cmd.js',
            layaCmdArgs
          );
        },
        skip: () => argv.skipUI,
      }),
      subError({
        title: 'Parsing & Converting',
        task: async () => {
          content = await fs.readFile(file, 'utf8');
          modules = content.split('export module');
          banner = modules.shift();

          modules.forEach((module, i) => {
            const start = module.indexOf('{');
            const end = module.lastIndexOf('}');
            namespaces.push(module.substring(0, start).trim());
            modules[i] = module.substring(start + 2, end);
          });

          modules.forEach((module, i) => {
            let im = '';
            const currNs = namespaces[i];
            namespaces.forEach((ns) => {
              const search = `:${ns}.`;
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
              module = replaceString(module, search, ':');
            });

            modules[i] = module;
            imports[i] = im;
          });
        },
      }),
      subError({
        title: 'Output',
        task: async () => {
          const del = codeExportPath.split('/').splice(1).join('.');
          await eachOf(modules, async (_module, i, cb) => {
            await fs.outputFile(
              path.join(
                output,
                ...namespaces[i].replace(del, '').split('.'),
                'index.ts'
              ),
              imports[i] + banner + modules[i]
            );
            if (cb) cb();
          });
          await fs.remove(file);
        },
      }),
    ]);
    await tasks.run();

    Log(`✨${chalk.bold('Done!')}`);
  } catch (error) {
    Log(chalk.bold.red(error));
  }
})();

async function checkLayaCmd(path: string) {
  const layaCmdPkg = await readPkg({
    cwd: path,
  });
  if (!GUARANTEE.includes(layaCmdPkg.version)) {
    Log(
      chalk.yellow(
        `Warn: layaair2-cmd@${
          layaCmdPkg.version
        } is not guaranteed to work. The guaranteed versions ${
          GUARANTEE.length > 1 ? 'are' : 'is'
        } ${GUARANTEE.join(', ')} .`
      )
    );
  }
}

function ns2path(ns: string) {
  return replaceString(ns, '.', '/');
}

function subError(listrTask: ListrTask) {
  return {
    ...listrTask,
    task: (_ctx, task): Listr =>
      task.newListr([{ ...listrTask, title: 'In progress' }]),
  } as ListrTask;
}
