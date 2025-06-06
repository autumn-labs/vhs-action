import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as intaller from './installer'
import * as deps from './dependencies'
import * as fonts from './fonts'
import * as core from '@actions/core'
import * as exec from '@actions/exec'

/**
 * Expands a path that might contain a tilde (~) to represent the home directory
 */
function expandPath(inputPath: string): string {
  if (inputPath.startsWith('~/') || inputPath === '~') {
    return inputPath.replace(/^~/, os.homedir())
  }
  return inputPath
}

async function run(): Promise<void> {
  try {
    const version = core.getInput('version')
    const filePath = core.getInput('path')
    const workingDirectory = core.getInput('working-directory')
    const extraPaths = core.getInput('extra-paths')

    // Fail fast if file does not exist.
    if (filePath) {
      const resolvedPath = workingDirectory
        ? path.join(workingDirectory, filePath)
        : filePath

      if (!fs.existsSync(resolvedPath)) {
        core.error(`File ${resolvedPath} does not exist`)
      } else {
        // Check that `resolvedPath` is a file, and that we can read it.
        fs.accessSync(resolvedPath, fs.constants.F_OK)
        fs.accessSync(resolvedPath, fs.constants.R_OK)
      }
    }

    await fonts.install()
    await deps.install()
    const bin = await intaller.install(version)

    core.info('Adding VHS to PATH')
    core.addPath(path.dirname(bin))

    // Collect additional paths to be added to PATH
    const additionalPaths: string[] = [path.dirname(bin)]

    // Add extra paths to PATH if specified
    if (extraPaths) {
      const paths = extraPaths.split(',').map(p => p.trim())
      for (const p of paths) {
        const expandedPath = expandPath(p)
        if (fs.existsSync(expandedPath)) {
          core.info(`Adding ${expandedPath} to PATH`)
          core.addPath(expandedPath)
          additionalPaths.push(expandedPath)
        } else {
          core.warning(`Path ${expandedPath} does not exist, skipping`)
        }
      }
    }

    // Unset the CI variable to prevent Termenv from ignoring terminal ANSI
    // sequences.
    core.exportVariable('CI', '')

    // GitHub Actions support terminal true colors, so we can enable it.
    core.exportVariable('COLORTERM', 'truecolor')

    if (filePath) {
      core.info('Running VHS')

      // Set up execution options
      const options: exec.ExecOptions = {}

      if (workingDirectory) {
        options.cwd = workingDirectory
        core.info(`Using working directory: ${workingDirectory}`)
      }

      // Modify PATH environment variable for the child process
      if (additionalPaths.length > 0) {
        // Create a modified path with our additional directories at the front
        const currentPath = process.env.PATH || ''
        const newPath = [...additionalPaths, currentPath].join(path.delimiter)
        core.info(`Setting PATH for VHS process: ${newPath}`)

        // Set up environment variables for the child process
        options.env = {
          ...process.env,
          PATH: newPath,
          // Make sure CI is unset and COLORTERM is set
          CI: '',
          COLORTERM: 'truecolor'
        }
      }

      await exec.exec(`${bin} ${filePath}`, [], options)
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
