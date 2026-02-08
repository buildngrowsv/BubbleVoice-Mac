// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "WebRTCSandbox",
    platforms: [
        .macOS(.v14)
    ],
    dependencies: [
        .package(url: "https://github.com/stasel/WebRTC.git", from: "125.0.0")
    ],
    targets: [
        .executableTarget(
            name: "WebRTCSandbox",
            dependencies: [
                .product(name: "WebRTC", package: "WebRTC")
            ],
            path: ".",
            sources: ["WebRTCEchoCancellationTest.swift"]
        )
    ]
)
