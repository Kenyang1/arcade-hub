import { type Db } from 'mongodb'
import { SESSIONS_COLLECTION } from '../core/sessions'

export async function idleSweep(database: Db) {
    // Retrieve the sessions collection.
    const sessionCollection = database.collection(SESSIONS_COLLECTION)

    // Get the threshold.
    const threshold = new Date(Date.now() - 10 * 60 * 1000)

    // Update all sessions with "running" or "paused".
    const result = await sessionCollection.updateMany(
        {
            status: { $in: ['running', 'paused'] },
            lastHeartbeatAt: { $lt: threshold }
        },
        {
            $set: { 
                status: 'idle'
            }
        }
    )

    console.log(`${result.modifiedCount} session(s) have been updated to "idle".`)
}