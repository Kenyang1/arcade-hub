import { type Db, GridFSBucket, ObjectId } from 'mongodb'
import { SAVES_COLLECTION, SAVE_STATE_BUCKET } from '../core/saves'

export async function pruneAutosaves(database: Db): Promise<number> {
    // Retrieve the save collection.
    const savesCollection = database.collection(SAVES_COLLECTION)

    // Retrieve the GridFS bucket containing the save files.
    const saveFilesBucket = new GridFSBucket(database, {bucketName: SAVE_STATE_BUCKET})

    // Retrieve unique (user, game) pairs.
    const userGamePairs = await savesCollection.aggregate<{
        userId: ObjectId,
        gameId: ObjectId
    }>([
        {
            $match: { kind: 'autosave' }
        },
        {
            $group: {
                _id: {
                    userId: '$userId',
                    gameId: '$gameId'
                }
        }
        },
        {
            $project: {
                 _id: 0,
                userId: '$_id.userId',
                gameId: '$_id.gameId'
            }
        }
    ]).toArray()

    // For each unique (user, game) pairs, only keep 5 autosaves.
    let totalDeletedAutosaves = 0
    for (const { userId, gameId } of userGamePairs) {
        // Get autosaves.
        const autosaves = await savesCollection
            .find({ userId, gameId, kind: 'autosave' })
            .sort({ createdAt: -1, _id: -1 })
            .toArray()

        // Get obsolete saves.
        const obsoleteSaves = autosaves.slice(5)
        if (obsoleteSaves.length <= 0)
            continue

        // Delete obsolete saves.
        for (const save of obsoleteSaves) {
            try {
                // Delete the file associated with the save file.
                await saveFilesBucket.delete(save.stateFileId)

                // Delete the save document.
                await savesCollection.deleteOne({ _id: save._id })

                totalDeletedAutosaves++
            } catch (error) {
                console.error(`Cannot delete autosave ${save._id}, stateFileId = ${save.stateFileId}`
                    , error)
            }
        }

        console.log(`Deleted ${obsoleteSaves.length} autosave(s) for (userId, gameId) = (${userId}, ${gameId})`)
    }

    return totalDeletedAutosaves
}