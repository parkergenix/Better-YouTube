//
//  AppDelegate.swift
//  Better YouTube
//
//  Created by parkergenix on 3/11/26.
//

import Cocoa
import Sparkle

@main
class AppDelegate: NSObject, NSApplicationDelegate, SPUUpdaterDelegate {

    private lazy var updaterController = SPUStandardUpdaterController(
        startingUpdater: true,
        updaterDelegate: self,
        userDriverDelegate: nil
    )

    func feedURLString(for updater: SPUUpdater) -> String? {
        return "https://raw.githubusercontent.com/parkergenix/Better-YouTube/main/appcast.xml"
    }

    func applicationDidFinishLaunching(_ notification: Notification) {}

    @IBAction func checkForUpdates(_ sender: Any) {
        updaterController.checkForUpdates(sender)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

}
