import { blue, magenta } from 'ansis';
import * as childProcess from 'child_process';
import * as log from 'fancy-log';
import { task } from 'gulp';
import { resolve } from 'path';
import { promisify } from 'util';
import { samplePath } from '../config';
import { containsPackageJson, getDirs } from '../util/task-helpers';

const exec = promisify(childProcess.exec);

async function executeNpmScriptInSamples(
  script: string,
  appendScript?: string,
) {
  const nodejsVersionMajorSlice = Number.parseInt(process.versions.node);

  const directories = getDirs(samplePath);

  // TODO: temporarily ignore Prisma sample as require('.')
  // leads to Module '"@prisma/client"' has no exported member 'Post' error
  const prismaSampleIndex = directories.indexOf(
    `${samplePath}/22-graphql-prisma`,
  );
  if (prismaSampleIndex !== -1) {
    directories.splice(prismaSampleIndex, 1);
  }

  // A dictionary that maps the sample number to the minimum Node.js version
  // required to execute any scripts.
  const minNodejsVersionBySampleNumber = {
    '34': 18, // we could use `engines.node` from package.json instead of hardcoding
    '35': 22,
  };

  for await (const dir of directories) {
    const sampleIdentifier = dir.match(/\d+/)?.[0];
    const minNodejsVersionForDir =
      sampleIdentifier && sampleIdentifier in minNodejsVersionBySampleNumber
        ? minNodejsVersionBySampleNumber[sampleIdentifier]
        : undefined;
    const isOnDesiredMinNodejsVersion = minNodejsVersionForDir
      ? nodejsVersionMajorSlice >= minNodejsVersionForDir
      : true;
    if (!isOnDesiredMinNodejsVersion) {
      console.info(
        `Skipping sample ${sampleIdentifier} because it requires Node.js version v${minNodejsVersionForDir}`,
      );
      continue;
    }

    // Check if the sample is a multi-application sample
    const isSingleApplicationSample = containsPackageJson(dir);
    if (!isSingleApplicationSample) {
      // Application is a multi-application sample
      // Go down into the sub-directories
      const subDirs = getDirs(dir);
      for (const subDir of subDirs) {
        await executeNPMScriptInDirectory(subDir, script, appendScript);
      }
    } else {
      await executeNPMScriptInDirectory(dir, script, appendScript);
    }
  }
}

/**
 * Executes the provided NPM script in the specified directory
 * @param dir directory of the application
 * @param script script to execute
 * @param appendScript additional params appended to the script
 */
async function executeNPMScriptInDirectory(
  dir: string,
  script: string,
  appendScript?: string,
) {
  const dirName = dir.replace(resolve(__dirname, '../../../'), '');
  log.info(`Running ${blue(script)} in ${magenta(dirName)}`);
  try {
    const result = await exec(
      `${script} --prefix ${dir} ${appendScript ? '-- ' + appendScript : ''}`,
    );
    // const result = await exec(`npx npm-check-updates -u`, {
    //   cwd: join(process.cwd(), dir),
    // });

    log.info(`Finished running ${blue(script)} in ${magenta(dirName)}`);
    if (result.stderr) {
      log.error(result.stderr);
    }
    if (result.stdout) {
      log.error(result.stdout);
    }
  } catch (err) {
    log.error(`Failed running ${blue(script)} in ${magenta(dirName)}`);
    if (err.stderr) {
      log.error(err.stderr);
    }
    if (err.stdout) {
      log.error(err.stdout);
    }
    process.exit(1);
  }
}

task('install:samples', async () =>
  executeNpmScriptInSamples(
    // 'npm ci --no-audit --no-shrinkwrap --no-optional',
    'npm install --legacy-peer-deps',
  ),
);
task('build:samples', async () => executeNpmScriptInSamples('npm run build'));
task('test:samples', async () =>
  executeNpmScriptInSamples('npm run test', '--passWithNoTests'),
);
task('test:e2e:samples', async () =>
  executeNpmScriptInSamples('npm run test:e2e', '--passWithNoTests'),
);
