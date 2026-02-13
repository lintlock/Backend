import Task from "../models/task.modal.js";
import ExcelJS from "exceljs";
import mongoose from "mongoose";
import asyncHandler from "../utility/asyncHandler.js";
import Store from "../models/store.modal.js";
import { json } from "express";



function monthsBetween(start, end) {
  const result = [];
  const dt = new Date(Date.UTC(start.getFullYear(), start.getMonth(), 1));
  const last = new Date(Date.UTC(end.getFullYear(), end.getMonth(), 1));
  while (dt <= last) {
    result.push(new Date(dt));
    dt.setUTCMonth(dt.getUTCMonth() + 1);
  }
  return result;
}

const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const getCostSummaryReport = async (req, res) => {
  try {
    const { range } = req.query;

    if (!range) {
      return res.status(400).json({
        message: "`range` query parameter is required. Allowed values: 1,3,6,12 (months)."
      });
    }

    const parsed = parseInt(String(range).replace(/[^0-9]/g, ""), 10);
    const monthsCount = [1, 3, 6, 12].includes(parsed) ? parsed : null;

    if (!monthsCount) {
      return res.status(400).json({
        message: "Invalid range. Allowed values: 1,3,6,12 (months)."
      });
    }

    const now = new Date();
    const end = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23, 59, 59, 999
    ));

    const start = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() - (monthsCount - 1),
      1
    ));

    const agg = await Task.aggregate([
      {
        $match: {
          createdBy: req.user._id,
          assign_date: { $gte: start, $lte: end },
          status:'completed',
          deletedAt:null
          
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$assign_date" },
            month: { $month: "$assign_date" }
          },
          totalCost: {
            $sum: {
              $add: [
                { $ifNull: ["$labour_cost", 0] },
                { $ifNull: ["$parts_cost", 0] }
              ]
            }
          }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    const costMap = new Map();
    for (const r of agg) {
      costMap.set(`${r._id.year}-${r._id.month}`, r.totalCost);
    }

    const monthList = monthsBetween(start, end);
    const labels = [];
    const data = [];

    for (const m of monthList) {
      const y = m.getUTCFullYear();
      const mo = m.getUTCMonth() + 1;

      labels.push(`${monthNames[m.getUTCMonth()]} ${y}`);
      data.push(costMap.get(`${y}-${mo}`) || 0);
    }

    const totalCost = data.reduce((s, v) => s + v, 0);
    const averageMonthlyCost =
      Math.round((totalCost / Math.max(data.length, 1)) * 100) / 100;

    return res.status(200).json({
      totalCost,
      averageMonthlyCost,
      monthly: { labels, data }
    });

  } catch (error) {
    return res.status(500).json({
      message: "Failed to generate cost summary report.",
      error: error.message
    });
  }
};

export const getMaintenanceCostBreakdown = async (req, res) => {
  try {
    const { range } = req.query;

    if (!range) {
      return res.status(400).json({
        message: "`range` query parameter is required. Allowed values: 1,3,6,12"
      });
    }

    const parsed = parseInt(String(range).replace(/[^0-9]/g, ""), 10);
    const monthsCount = [1, 3, 6, 12].includes(parsed) ? parsed : null;

    if (!monthsCount) {
      return res.status(400).json({
        message: "Invalid range. Allowed values: 1,3,6,12"
      });
    }

    const now = new Date();
    const end = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23, 59, 59, 999
    ));

    const start = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() - (monthsCount - 1),
      1
    ));

    const agg = await Task.aggregate([
      {
        $match: {
          createdBy: req.user._id,
          assign_date: { $gte: start, $lte: end },
          status:'completed',
          deletedAt:null
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$assign_date" },
            month: { $month: "$assign_date" }
          },
          partsCost: { $sum: { $ifNull: ["$parts_cost", 0] } },
          laborCost: { $sum: { $ifNull: ["$labour_cost", 0] } }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    const monthMap = new Map();
    for (const r of agg) {
      monthMap.set(`${r._id.year}-${r._id.month}`, {
        parts: r.partsCost,
        labor: r.laborCost
      });
    }

    const monthList = monthsBetween(start, end);
    const monthlyBreakdown = [];

    let totalPartsCost = 0;
    let totalLaborCost = 0;

    for (const m of monthList) {
      const y = m.getUTCFullYear();
      const mo = m.getUTCMonth() + 1;
      const key = `${y}-${mo}`;

      const parts = monthMap.get(key)?.parts || 0;
      const labor = monthMap.get(key)?.labor || 0;
      const total = parts + labor;

      totalPartsCost += parts;
      totalLaborCost += labor;

      monthlyBreakdown.push({
        date: `${monthNames[m.getUTCMonth()]} ${y}`,
        partsCost: parts,
        laborCost: labor,
        totalCost: total
      });
    }

    return res.status(200).json({
      totalPartsCost,
      totalLaborCost,
      grandTotal: totalPartsCost + totalLaborCost,

      chart: {
        labels: ["Parts", "Labor"],
        data: [totalPartsCost, totalLaborCost]
      },

      monthlyBreakdown
    });

  } catch (error) {
    return res.status(500).json({
      message: "Failed to generate maintenance cost breakdown",
      error: error.message
    });
  }
};

export const downloadMaintenanceLog = asyncHandler(async (req, res, next) => {
  const { range, machineId } = req.query;
  const userId = req.user._id;

  if (!range || !machineId) {
    return next({ status: 400, message: "Range and machineId are required" });
  }

  const allowedRanges = ["1", "3", "6", "12", "all"];
  if (!allowedRanges.includes(range)) {
    return next({
      status: 400,
      message: "Range must be one of: 1, 3, 6, 12, all",
    });
  }

  let machineIds = [];

  if (machineId === "all") {
    const store = await Store.findOne({
      ownerId: userId,
      isActive: true,
      deletedAt: null,
    });

    if (!store) {
      return next({ status: 404, message: "Store not found for the user" });
    }

    const machines = await mongoose.connection.db
      .collection("machines")
      .find({ storeId: store._id })
      .project({ _id: 1 })
      .toArray();

    machineIds = machines.map(m => m._id);

    if (!machineIds.length) {
      return next({ status: 404, message: "No machines found for this store" });
    }
  }

  let fromDate = null;
  let toDate = null;

  if (range !== "all") {
    const months = parseInt(range, 10);
    toDate = new Date();
    fromDate = new Date();
    fromDate.setMonth(fromDate.getMonth() - months);
  }

  const matchStage = {
    status: { $ne: "cancelled" },
    ...(machineId === "all"
      ? { machineId: { $in: machineIds } }
      : { machineId: new mongoose.Types.ObjectId(machineId) }),
    ...(range !== "all" && { createdAt: { $gte: fromDate, $lte: toDate } }),
  };

  const groupedLogs = await mongoose.connection.db
  .collection("tasks")
  .aggregate([
    { $match: matchStage },

    {
      $lookup: {
        from: "maintenancelogs",
        localField: "_id",
        foreignField: "taskId",
        as: "logs",
      },
    },
    {
      $unwind: {
        path: "$logs",
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $lookup: {
        from: "users",
        localField: "logs.createdBy",
        foreignField: "_id",
        as: "createdByUser",
      },
    },
    {
      $unwind: {
        path: "$createdByUser",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: "machines",
        localField: "machineId",
        foreignField: "_id",
        as: "machine",
      },
    },
    { $unwind: "$machine" },
    {
      $project: {
        taskId: "$_id",
        task: {
          _id: "$_id",
          task: "$task",
          description: "$description",
          status: "$status",
          assign_date: "$assign_date",
          completed_date: "$completed_date",
        },
        machine: {
          _id: "$machine._id",
          machineId: "$machine.machineId",
          machineType: "$machine.machineType",
        },
        log: {
          $cond: [
            { $ifNull: ["$logs._id", false] },
            {
              _id: "$logs._id",
              logEntry: "$logs.logEntry",
              labour_cost: "$logs.labour_cost",
              parts_cost: "$logs.parts_cost",
              date: "$logs.date",
              createdAt: "$logs.createdAt",
              createdBy: {
                _id: "$createdByUser._id",
                fullName: "$createdByUser.fullName",
              },
            },
            null,
          ],
        },
      },
    },

    {
      $group: {
        _id: "$taskId",
        task: { $first: "$task" },
        machine: { $first: "$machine" },
        logs: {
          $push: {
            $cond: [{ $ne: ["$log", null] }, "$log", "$$REMOVE"],
          },
        },
      },
    },
    {
      $group: {
        _id: "$machine._id",
        machine: { $first: "$machine" },
        tasks: {
          $push: {
            task: "$task",
            logs: "$logs",
            logCount: { $size: "$logs" },
            totalLabourCost: {
              $sum: "$logs.labour_cost",
            },
            totalPartsCost: {
              $sum: "$logs.parts_cost",
            },
          },
        },
      },
    },

    { $sort: { "machine.machineId": 1 } },
  ])
  .toArray();

  generateExcelFile(groupedLogs, res, range, fromDate, toDate, machineId);
});

 
async function generateExcelFile(
  groupedLogs,
  res,
  range,
  fromDate,
  toDate,
  machineId
) {
  console.log(JSON.stringify(groupedLogs));
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Maintenance Logs");
  worksheet.columns = [
    { width: 35 }, 
    { width: 15 }, 
    { width: 15 }, 
    { width: 15 }, 
    { width: 25 }, 
    { width: 15 }, 
  ];

  const machineLabel =
    machineId === "all" ? "All Machines" : groupedLogs[0]?.machine?.machineId;

  const rangeLabel =
    range === "all" ? "All Time" : `Last ${range} Month`;

  const title = `${rangeLabel} (${fromDate?.toISOString().split("T")[0]} to ${toDate?.toISOString().split("T")[0]}) (${machineLabel})`;

  worksheet.mergeCells(1, 1, 1, 6);
  const titleRow = worksheet.getRow(1);
  titleRow.getCell(1).value = title;
  titleRow.height = 30;
  titleRow.font = { size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  titleRow.alignment = { vertical: "middle", horizontal: "center" };
  titleRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4F78C4" },
  };

  let row = 3;

  let grandLabour = 0;
  let grandParts = 0;
  let grandTaskCount = 0;

  for (const machineGroup of groupedLogs) {
    const machine = machineGroup.machine;
    worksheet.mergeCells(row, 1, row, 6);
    const machineRow = worksheet.getRow(row);
    machineRow.getCell(1).value = `Machine: ${machine.machineId} (${machine.machineType})`;
    machineRow.font = { bold: true, size: 14 };
    machineRow.height = 24;
    machineRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFDCE6F1" },
    };
    row++;

    let machineLabour = 0;
    let machineParts = 0;
    let machineLogs = 0;

    for (const taskGroup of machineGroup.tasks) {
      const task = taskGroup.task;
     grandTaskCount++;
      worksheet.mergeCells(row, 1, row, 6);
      const taskRow = worksheet.getRow(row);
      taskRow.getCell(1).value = `Task: ${task.task} | Status: ${task.status}`;
      taskRow.font = { bold: true, size: 12 };
      const status = (task.status || "").toLowerCase();

      let statusColor 

      if (status === "completed") {
        statusColor = "FFDCFCE7"; 
      } else if (status === "open") {
        statusColor = "FFFEF9C3"; 
      } else if (status === "cancelled") {
        statusColor = "FFFEE2E2";
      }
      taskRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: statusColor},
      };
      row++;

   
      const headerRow = worksheet.getRow(row);
      headerRow.values = [
        "Log Entry",
        "Labour Cost",
        "Parts Cost",
        "Total Cost",
        "Created By",
        "Date",
      ];
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.alignment = { horizontal: "center" };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF3F3F3F" },
      };
      row++;

      let taskLabour = 0;
      let taskParts = 0;
      let taskLogs = 0;

      if (!taskGroup.logs.length) {
        worksheet.addRow([
          "No maintenance logs",
          "-",
          "-",
          "-",
          "",
          "",
        ]);
        row++;
      } else {
        for (const log of taskGroup.logs) {
          const labour = Number(log.labour_cost || 0);
          const parts = Number(log.parts_cost || 0);

          taskLabour += labour;
          taskParts += parts;
          taskLogs++;

          const dataRow = worksheet.addRow([
            log.logEntry,
            `$${labour.toFixed(2)}`,
            `$${parts.toFixed(2)}`,
            `$${(labour + parts).toFixed(2)}`,
            log.createdBy?.fullName || "",
            log.date ? new Date(log.date).toISOString().split("T")[0] : "",
          ]);

          dataRow.eachCell((cell, col) => {
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };

            if (col >= 2 && col <= 4) {
              cell.numFmt = "#,##0.00";
              cell.alignment = { horizontal: "right" };
            }
          });

          row++;
        }
      }

      const summaryRow = worksheet.getRow(row);
      summaryRow.values = [
        `Task Summary (Logs: ${taskLogs})`,
        `$${taskLabour.toFixed(2)}`,
        `$${taskParts.toFixed(2)}`,
        `$${(taskLabour + taskParts).toFixed(2)}`,
        "",
        "",
      ];
      summaryRow.font = { bold: true };
      summaryRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE6E6E6" },
      };

      summaryRow.getCell(2).numFmt = "#,##0.00";
      summaryRow.getCell(3).numFmt = "#,##0.00";
      summaryRow.getCell(4).numFmt = "#,##0.00";

      row += 2;

      machineLabour += taskLabour;
      machineParts += taskParts;
      machineLogs += taskLogs;
    }


    const machineSummaryRow = worksheet.getRow(row);
    machineSummaryRow.values = [
      `Machine Total (Logs: ${machineLogs})`,
      `$${machineLabour.toFixed(2)}`,
      `$${machineParts.toFixed(2)}`,
      `$${(machineLabour + machineParts).toFixed(2)}`,
      "",
      "",
    ];
    machineSummaryRow.font = { bold: true, size: 12 };
    machineSummaryRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFCCCCCC" },
    };

    machineSummaryRow.getCell(2).numFmt = "#,##0.00";
    machineSummaryRow.getCell(3).numFmt = "#,##0.00";
    machineSummaryRow.getCell(4).numFmt = "#,##0.00";

    row += 3;

    grandLabour += machineLabour;
    grandParts += machineParts;

  }

  worksheet.mergeCells(row, 1, row, 6);
  const grandRow = worksheet.getRow(row);
  grandRow.getCell(1).value = `Grand Total (Tasks: ${grandTaskCount}) | Labour: $${grandLabour} | Parts: $${grandParts} | Total: $${grandLabour + grandParts}`;
  grandRow.font = { bold: true, size: 13 };
  grandRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFB7DEE8" },
  };

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=maintenance-logs-${Date.now()}.xlsx`
  );

  await workbook.xlsx.write(res);
  res.end();
}

