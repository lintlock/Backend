import OperatingHours from "../models/operatingHours.modal.js";

const VALID_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

export const createOrUpdateOperatingHours = async (storeId, days) => {
    if (!storeId) throw new Error('storeId is required');
    if (!Array.isArray(days) || days.length === 0) throw new Error('`days` must be a non-empty array');

    const seen = new Set();
    for (const d of days) {
        if (!d || !d.day || !VALID_DAYS.includes(d.day)) {
            throw new Error('Each day entry must include a valid `day` value');
        }
        if (seen.has(d.day)) {
            throw new Error(`Duplicate day entry: ${d.day}`);
        }
        seen.add(d.day);

        if (d.isOpen) {
            if (!d.openTime || !d.closeTime) {
                throw new Error(`openTime and closeTime required for ${d.day}`);
            }
            if (!/^\d{2}:\d{2}$/.test(d.openTime) || !/^\d{2}:\d{2}$/.test(d.closeTime)) {
                throw new Error('Time must be in HH:MM format');
            }
        }
    }

    const operating = await OperatingHours.findOneAndUpdate(
        { storeId },
        { days },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    return operating;
};

export default createOrUpdateOperatingHours;
