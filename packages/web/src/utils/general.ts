export const undefinedOnError = async<T>(func: Promise<T>): Promise<T | undefined> => {
    try {
        return await func
    } catch (e) {
        console.error(e)
        return undefined
    }
}