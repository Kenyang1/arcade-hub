import { type Db, GridFSBucket, ObjectId } from 'mongodb'
import { SAVES_COLLECTION, SAVE_STATE_BUCKET } from '../core/saves'

export async function pruneAutosaves(database: Db) {
    // Retrieve the save collection.
    const saves = database.collection(SAVES_COLLECTION)

    // Retrieve the GridFS bucket containing the save files.
    const saveFileBucket = new GridFSBucket(database, {bucketName: SAVE_STATE_BUCKET})

    // Get unique users from the saves collection.
    const uniqueUserIds = await saves.distinct<string>('userId') as ObjectId[]

    // For each unique user, keep only the 5 lastest autosaves.
    for (const userId of uniqueUserIds) {
        
        // Get the autosaves, sorted descendingly by create date.
        const autosaves = await saves
            .find({userId, kind: 'autosave'})
            .sort({ createdAt: -1})
            .toArray()

        // If the user has only 5 autosaves or fewer, 
        // there is no need to remove anything.
        if (autosaves.length <= 5)
            continue

        // Remove old saves.
        const oldAutosaves = autosaves.slice(5)
        for (const save of oldAutosaves) {
            // Delete the file associated with the save file.
            try {
                await saveFileBucket.delete(save.stateFileId)
            } catch (error) {
                console.error(`Cannot delete the save file in GridFS with stateFileId = ${save.stateFileId}`
                    , error)
            }

            // Delete the save document.
            await saves.deleteOne({ _id: save._id })
        }

        console.log(`Removed ${autosaves.length} autosave(s) for userId = ${userId}.`)
    }
}