import mongoose from "mongoose";


const task =new  mongoose.Schema(
    {
        machineId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Machine",
            required: true
        },
        task:{
            type: String,
            required: true,
        },

        description: {
            type: String,
            required: true, 
        },
        status: {
            type: String,
            enum: ["open", "needs_service", "completed","cancelled"],
            default: "open"
        },
        deletedAt:{
            type:Date,
            default:null
        },
        assign_date :{
            type: Date,
            required: true

        },
        requestId:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "TaskRequest",
        },
        completion_date: {
            type: Date
        },
        labour_cost: {
            type: Number,
            required: true
        },
        parts_cost: {
            type: Number
        },
        technicianId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        completedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        completed_at: {
            type: Date
        },
        images:[
            {
                type: String,
                required: false
            }
        ],

    },
    {
        timestamps: true           
    }
)

const Task = mongoose.model("Task", task);
export default Task;