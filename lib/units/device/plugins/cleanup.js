import syrup from '@devicefarmer/stf-syrup'
import Promise from 'bluebird'
import _ from 'lodash'
import {Utils} from '@u4/adbkit'
import logger from '../../../util/logger.js'
import adb from '../support/adb.js'
import service from '../resources/service.js'
import group from './group.js'
import service$0 from './service.js'
import {checkCleanupFolders, entriesToRemove} from './util/cleanup-folders.js'
export default syrup.serial()
    .dependency(adb)
    .dependency(service)
    .dependency(group)
    .dependency(service$0)
    .define(function(options, adb, stfservice, group, service) {
        var log = logger.createLogger('device:plugins:cleanup')
        var plugin = Object.create(null)
        if (!options.cleanup) {
            return plugin
        }
        // Throws on a system folder, which stops the device unit rather than risk wiping it
        var cleanupFolders = checkCleanupFolders(options.cleanupFolder)
        if (cleanupFolders.length) {
            log.info('Cleanup folders: %s', cleanupFolders.join(', '))
        }
        function listPackages() {
            return Promise.resolve().then(async() => await adb.getDevice(options.serial).getPackages())
        }
        function uninstallPackage(pkg) {
            log.info('Cleaning up package "%s"', pkg)
            return adb.getDevice(options.serial).uninstall(pkg)
                .catch(function(err) {
                    log.warn('Unable to clean up package "%s"', pkg, err)
                    return true
                })
        }
        function cleanFolder(folder) {
            log.info('Cleaning up folder "%s"', folder)
            return adb.getDevice(options.serial).readdir(folder)
                .then(function(entries) {
                    var remove = entriesToRemove(folder, entries.map(function(entry) {
                        return entry.name
                    }))
                    return Promise.map(remove, function(file) {
                        log.info('Removing "%s"', file)
                        return adb.getDevice(options.serial).shell(['rm', '-rf', file])
                            .then(Utils.readAll)
                    }, {concurrency: 4})
                })
                .catch(function(err) {
                    log.warn('Unable to clean up folder "%s"', folder, err)
                })
        }
        return listPackages()
            .then(function(initialPackages) {
                initialPackages.push(stfservice.pkg)
                plugin.removePackages = function() {
                    return listPackages()
                        .then(function(currentPackages) {
                            var remove = _.difference(currentPackages, initialPackages)
                            return Promise.map(remove, uninstallPackage)
                        })
                }
                plugin.disableBluetooth = function() {
                    if (!options.cleanupDisableBluetooth) {
                        return
                    }
                    return service.getBluetoothStatus()
                        .then(function(enabled) {
                            if (enabled) {
                                log.info('Disabling Bluetooth')
                                return service.setBluetoothEnabled(false)
                            }
                        })
                }
                plugin.cleanBluetoothBonds = function() {
                    if (!options.cleanupBluetoothBonds) {
                        return
                    }
                    log.info('Cleanup Bluetooth bonds')
                    return service.cleanBluetoothBonds()
                }
                plugin.cleanFolders = function() {
                    return Promise.each(cleanupFolders, cleanFolder)
                }
                group.on('leave', function() {
                    return Promise.all([
                        plugin.removePackages(),
                        plugin.cleanBluetoothBonds(),
                        plugin.disableBluetooth(),
                        plugin.cleanFolders()
                    ])
                })
            })
            .return(plugin)
    })
