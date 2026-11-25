import { closeMongo, connectMongo } from '../core/mongo.ts'
import { logger } from '../logger.ts'
import { idleSweep } from './idle-sweep.ts'
import { importGames } from './import-games.ts'
import { pruneAutosaves } from './prune-autosaves.ts'

// The jobs CLI: `pnpm --dir api jobs <job> [args]`, or `node dist/jobs/cli.js`
// in the API image. import-games is run by hand; the CronJobs run the others.

const usage = 'usage: jobs import-games <folder> [--apply] | idle-sweep | prune-autosaves'

async function main(argv: string[]): Promise<void> {
  const [command, ...args] = argv

  // Import games to GridFS
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

  // All running or paused sessions whose heartbeat is at least 10 minutes old
  // are marked as idle.
  if (command === 'idle-sweep') {
    const db = await connectMongo()
    await idleSweep(db)
    return
  }

  // For each user, keep only the latest 5 autosave files.
  // Manual savefiles stay intact.
  if (command === 'prune-autosaves') {
    const db = await connectMongo()
    const totalDeletedAutosaves = await pruneAutosaves(db)
    console.log(`Deleted ${totalDeletedAutosaves} autosave(s).`)
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
