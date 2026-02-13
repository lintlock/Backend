import mongoose from "mongoose";

const daysSchema = new mongoose.Schema({
    day: {
        type: String,
        enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        required: true
    },
    isOpen: {
        type: Boolean,
        default: true
    },
    openTime: {
        type: String, // "06:00"
        required: function () {
            return this.isOpen;
        }
    },

    closeTime: {
        type: String, // "22:00"
        required: function () {
            return this.isOpen;
        }
    },
   
}, { _id : false});

const operatingHoursSchema = new mongoose.Schema({
    storeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Store",
        required: true,
        unique: true
    },
    days: {
        type: [daysSchema],
        required: true,
    }
}, {timestamps: true});

const OperatingHours = mongoose.model("OperatingHours", operatingHoursSchema);
export default OperatingHours;


