const stationService = require('../services/pickupStation.service');

async function list(req, res, next) {
  try {
    const items = await stationService.listStations({ search: req.query.search });
    res.json({ success: true, items });
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    const station = await stationService.createStation(req.body, req.admin?.id, req.ip);
    res.status(201).json({ success: true, message: 'Pickup station created successfully', data: station });
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const station = await stationService.updateStation(req.params.id, req.body, req.admin?.id, req.ip);
    res.json({ success: true, message: 'Pickup station updated successfully', data: station });
  } catch (error) {
    next(error);
  }
}

async function toggleActive(req, res, next) {
  try {
    const station = await stationService.toggleStationActive(req.params.id, req.body.isActive, req.admin?.id, req.ip);
    res.json({
      success: true,
      message: `Pickup station ${station.isActive ? 'activated' : 'deactivated'} successfully`,
      data: station,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { list, create, update, toggleActive };
