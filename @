import mongoose from "mongoose";

const InternshipSchema = new mongoose.Schema({

    userId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true,
        unique:true
    },

    currentPhase:{
        type:String,
        enum:[
            "GENERAL",
            "PHASE_1",
            "PHASE_2",
            "PHASE_3",
            "COMPLETED"
        ],
        default:"GENERAL"
    }

});

export default mongoose.model(
    "InternshipProgress",
    InternshipSchema
);
