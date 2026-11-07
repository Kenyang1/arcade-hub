import { closeMongo, connectMongo } from '../core/mongo.ts'
import { logger } from '../logger.ts'
import { importGames } from './import-games.ts'

// The jobs CLI: `pnpm --dir api jobs <job> [args]`, or `node dist/jobs/cli.js`
// in the API image. import-games is run by hand; the CronJobs run the others.

const usage = 'usage: jobs import-games <folder> [--apply] | idle-sweep | prune-autosaves'

async function main(argv: string[]): Promise<void> {
  const [command, ...args] = argv
  if (command === 'import-games') {
    const folder = args.find((arg) => !arg.startsWith('--'))
    if (!folder) throw new Error(usage)
    const apply = args.includes('--apply')
    const db = await connectMongo()
    const { imported, skipped } = await importGames(db, folder, apply)
    const verb = apply ? 'imported' : 'would be imported (dry run, add --apply)'
    logger.info({ imported, skipped, apply }, `import-games: ${imported.length} games ${verb}`)
    return
  }
  if (command === 'idle-sweep' || command === 'prune-autosaves') {
    logger.info(`${command}: not implemented yet`)
    return
  }
  throw new Error(command ? `unknown job "${command}". ${usage}` : usage)
}

try {
  await main(process.argv.slice(2))
} catch (error) {
  logger.error({ err: error }, error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  await closeMongo()
}
