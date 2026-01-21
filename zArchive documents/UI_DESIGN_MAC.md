# Bubble Voice Mac - UI Design Guide

**Created:** 2026-01-15  
**Purpose:** UI design patterns and implementation for macOS 16+ Liquid Glass aesthetic.

---

## 📋 Design Philosophy

Bubble Voice Mac embraces **Liquid Glass** (macOS 16 / WWDC 2025):

| Principle | Implementation |
|-----------|----------------|
| **Translucent** | Glass materials that show desktop behind |
| **Floating** | Panel hovers above other windows |
| **Minimal** | Essential controls only, no clutter |
| **Reactive** | Responds to voice state with animation |
| **Ambient** | Subtle gradients and depth |

---

## 🎨 Visual Design

### Color Palette

```swift
/// Design tokens for Bubble Voice Mac
/// Using semantic colors that adapt to light/dark mode
/// Glass effects use Apple's system materials
///
/// Date: 2026-01-15
struct BubbleVoiceColors {
    
    // Primary brand colors
    static let accent = Color("BrandAccent")  // Define in Assets
    static let accentGradient = LinearGradient(
        colors: [Color.blue, Color.purple],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    
    // State colors
    static let listening = Color.green
    static let speaking = Color.blue
    static let thinking = Color.orange
    static let idle = Color.secondary
    
    // Glass backgrounds
    static let glassBackground = Material.ultraThinMaterial
    static let glassRegular = Material.regularMaterial
    static let glassThick = Material.thickMaterial
    
    // Semantic
    static let textPrimary = Color.primary
    static let textSecondary = Color.secondary
    static let separator = Color.primary.opacity(0.1)
}
```

### Typography

```swift
/// Typography scale for Bubble Voice Mac
/// Uses SF Pro (system font) with weight variations
/// Optimized for floating window readability
///
/// Date: 2026-01-15
struct BubbleVoiceTypography {
    
    // Headers
    static let title = Font.system(size: 18, weight: .semibold, design: .rounded)
    static let subtitle = Font.system(size: 14, weight: .medium)
    
    // Body text
    static let body = Font.system(size: 13, weight: .regular)
    static let bodyBold = Font.system(size: 13, weight: .semibold)
    
    // Transcript
    static let transcriptUser = Font.system(size: 14, weight: .regular)
    static let transcriptAssistant = Font.system(size: 14, weight: .medium)
    
    // Small labels
    static let caption = Font.system(size: 11, weight: .regular)
    static let captionBold = Font.system(size: 11, weight: .semibold)
    
    // Monospace for technical content
    static let mono = Font.system(size: 12, weight: .regular, design: .monospaced)
}
```

---

## 🖼️ Main Window Layout

```
┌─────────────────────────────────────────┐
│ ┌─────────────────────────────────────┐ │
│ │        Status Indicator             │ │  ← Animated state circle
│ │           ○ Listening...            │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
│ │        Transcript Scroll            │ │  ← Messages with glass bubbles
│ │                                     │ │
│ │   [User message bubble]             │ │
│ │            [Assistant bubble]       │ │
│ │   [User message bubble]             │ │
│ │            [Assistant bubble]       │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │  [Interrupt] [End] [History] [⚙️]   │ │  ← Glass toolbar
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

---

## 🔧 SwiftUI Components

### Main Conversation Window

```swift
import SwiftUI

/// Main conversation window for Bubble Voice Mac
/// Floating panel with glass background and live transcript
///
/// Design Notes:
/// - Uses .ultraThinMaterial for see-through glass effect
/// - Window floats above other apps when focused
/// - Compact size for non-intrusive desktop presence
///
/// Date: 2026-01-15
struct ConversationWindowView: View {
    @EnvironmentObject var appState: AppState
    @State private var scrollProxy: ScrollViewProxy? = nil
    
    var body: some View {
        VStack(spacing: 0) {
            // Status indicator at top
            StatusIndicatorView()
                .padding(.top, 16)
                .padding(.bottom, 8)
            
            Divider()
                .opacity(0.3)
            
            // Transcript scroll area
            TranscriptScrollView()
            
            Divider()
                .opacity(0.3)
            
            // Control toolbar at bottom
            ControlToolbarView()
                .padding(.vertical, 12)
        }
        .frame(width: 380, height: 500)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.2), radius: 20, x: 0, y: 10)
    }
}
```

### Status Indicator

```swift
import SwiftUI

/// Animated status indicator showing voice state
/// Uses concentric circles that pulse during listening
///
/// States:
/// - Idle: Subtle gray ring
/// - Listening: Green pulsing circles
/// - Thinking: Orange rotating dots
/// - Speaking: Blue expanding rings
///
/// Date: 2026-01-15
struct StatusIndicatorView: View {
    @EnvironmentObject var appState: AppState
    
    // Animation state
    @State private var pulseScale: CGFloat = 1.0
    @State private var pulseOpacity: Double = 0.5
    @State private var rotationAngle: Double = 0
    
    var body: some View {
        VStack(spacing: 8) {
            // Animated circle
            ZStack {
                // Outer pulse rings (for listening/speaking)
                ForEach(0..<3) { index in
                    Circle()
                        .stroke(stateColor.opacity(pulseOpacity), lineWidth: 2)
                        .frame(width: 60 + CGFloat(index * 20), height: 60 + CGFloat(index * 20))
                        .scaleEffect(pulseScale)
                        .opacity(isActive ? 1 : 0)
                }
                
                // Core circle
                Circle()
                    .fill(stateColor.opacity(0.3))
                    .frame(width: 50, height: 50)
                
                Circle()
                    .stroke(stateColor, lineWidth: 3)
                    .frame(width: 50, height: 50)
                
                // Waveform icon
                Image(systemName: iconName)
                    .font(.system(size: 20, weight: .medium))
                    .foregroundColor(stateColor)
                    .rotationEffect(.degrees(isThinking ? rotationAngle : 0))
            }
            
            // Status text
            Text(statusText)
                .font(BubbleVoiceTypography.caption)
                .foregroundColor(BubbleVoiceColors.textSecondary)
        }
        .onAppear { startAnimations() }
        .onChange(of: appState.isListening) { startAnimations() }
        .onChange(of: appState.isSpeaking) { startAnimations() }
    }
    
    // MARK: - Computed Properties
    
    private var stateColor: Color {
        if appState.isSpeaking { return BubbleVoiceColors.speaking }
        if appState.isListening { return BubbleVoiceColors.listening }
        return BubbleVoiceColors.idle
    }
    
    private var statusText: String {
        if appState.isSpeaking { return "Speaking..." }
        if appState.isListening { return "Listening..." }
        return "Ready"
    }
    
    private var iconName: String {
        if appState.isSpeaking { return "waveform" }
        if appState.isListening { return "mic.fill" }
        return "waveform.circle"
    }
    
    private var isActive: Bool {
        appState.isListening || appState.isSpeaking
    }
    
    private var isThinking: Bool { false } // Add when processing
    
    // MARK: - Animations
    
    private func startAnimations() {
        guard isActive else {
            pulseScale = 1.0
            pulseOpacity = 0.5
            return
        }
        
        // Pulse animation
        withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
            pulseScale = 1.3
            pulseOpacity = 0.1
        }
    }
}
```

### Transcript Scroll View

```swift
import SwiftUI

/// Scrolling transcript view showing conversation history
/// Uses glass bubbles for messages with distinct user/assistant styling
///
/// Features:
/// - Auto-scrolls to newest message
/// - Glass material bubbles
/// - Timestamps on hover
/// - Smooth scroll animations
///
/// Date: 2026-01-15
struct TranscriptScrollView: View {
    @EnvironmentObject var appState: AppState
    @Namespace private var bottomID
    
    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(appState.transcript) { message in
                        MessageBubbleView(message: message)
                    }
                    
                    // Anchor for scrolling
                    Color.clear
                        .frame(height: 1)
                        .id(bottomID)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .onChange(of: appState.transcript.count) {
                withAnimation(.easeOut(duration: 0.3)) {
                    proxy.scrollTo(bottomID, anchor: .bottom)
                }
            }
        }
    }
}

/// Single message bubble in transcript
/// Glass styling with alignment based on role
///
/// Date: 2026-01-15
struct MessageBubbleView: View {
    let message: TranscriptMessage
    
    @State private var isHovered = false
    
    private var isUser: Bool { message.role == "user" }
    
    var body: some View {
        HStack {
            if !isUser { Spacer(minLength: 40) }
            
            VStack(alignment: isUser ? .trailing : .leading, spacing: 4) {
                Text(message.content)
                    .font(isUser ? BubbleVoiceTypography.transcriptUser : BubbleVoiceTypography.transcriptAssistant)
                    .foregroundColor(BubbleVoiceColors.textPrimary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(isUser ? .thinMaterial : .regularMaterial)
                    )
                
                // Timestamp on hover
                if isHovered {
                    Text(formatTime(message.timestamp))
                        .font(BubbleVoiceTypography.caption)
                        .foregroundColor(BubbleVoiceColors.textSecondary)
                        .transition(.opacity)
                }
            }
            
            if isUser { Spacer(minLength: 40) }
        }
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.2)) {
                isHovered = hovering
            }
        }
    }
    
    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}
```

### Control Toolbar

```swift
import SwiftUI

/// Bottom toolbar with conversation controls
/// Glass buttons for interrupt, end, history, settings
///
/// Design Notes:
/// - Horizontal layout with equal spacing
/// - Icons with labels for clarity
/// - Hover states for interactivity
///
/// Date: 2026-01-15
struct ControlToolbarView: View {
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        HStack(spacing: 16) {
            // Interrupt button (only when speaking)
            if appState.isSpeaking {
                GlassButton(
                    icon: "hand.raised.fill",
                    label: "Interrupt",
                    color: .orange
                ) {
                    // Handle interrupt
                }
                .transition(.scale.combined(with: .opacity))
            }
            
            Spacer()
            
            // End conversation
            GlassButton(
                icon: appState.isListening ? "stop.fill" : "mic.fill",
                label: appState.isListening ? "End" : "Start",
                color: appState.isListening ? .red : .green
            ) {
                // Toggle listening
                appState.isListening.toggle()
            }
            
            Spacer()
            
            // History
            GlassButton(
                icon: "clock.arrow.circlepath",
                label: "History",
                color: .secondary
            ) {
                // Show history
            }
            
            // Settings
            GlassButton(
                icon: "gearshape.fill",
                label: "Settings",
                color: .secondary
            ) {
                // Open settings
                NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
            }
        }
        .padding(.horizontal, 20)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: appState.isSpeaking)
    }
}

/// Glass-style button for toolbar
/// Circular icon with label below, glass background on hover
///
/// Date: 2026-01-15
struct GlassButton: View {
    let icon: String
    let label: String
    let color: Color
    let action: () -> Void
    
    @State private var isHovered = false
    @State private var isPressed = false
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                ZStack {
                    Circle()
                        .fill(isHovered ? color.opacity(0.2) : .clear)
                        .frame(width: 44, height: 44)
                    
                    Circle()
                        .stroke(color.opacity(isHovered ? 1 : 0.5), lineWidth: 1.5)
                        .frame(width: 44, height: 44)
                    
                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .medium))
                        .foregroundColor(color)
                }
                .scaleEffect(isPressed ? 0.9 : 1.0)
                
                Text(label)
                    .font(BubbleVoiceTypography.caption)
                    .foregroundColor(isHovered ? color : BubbleVoiceColors.textSecondary)
            }
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.15)) {
                isHovered = hovering
            }
        }
        .pressEvents {
            withAnimation(.easeInOut(duration: 0.1)) { isPressed = true }
        } onRelease: {
            withAnimation(.easeInOut(duration: 0.1)) { isPressed = false }
        }
    }
}

// MARK: - Press Events Modifier

extension View {
    func pressEvents(onPress: @escaping () -> Void, onRelease: @escaping () -> Void) -> some View {
        self.simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in onPress() }
                .onEnded { _ in onRelease() }
        )
    }
}
```

### Menu Bar Popover

```swift
import SwiftUI

/// Menu bar popover for quick status and controls
/// Shows when clicking the menu bar icon
///
/// Features:
/// - Status at a glance
/// - Quick toggle for listening
/// - Recent conversation preview
/// - Quick access to settings
///
/// Date: 2026-01-15
struct MenuBarPopover: View {
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        VStack(spacing: 12) {
            // Header
            HStack {
                Image(systemName: "waveform.circle.fill")
                    .font(.title2)
                    .foregroundStyle(appState.isListening ? BubbleVoiceColors.listening : BubbleVoiceColors.idle)
                
                Text("Bubble Voice")
                    .font(BubbleVoiceTypography.title)
                
                Spacer()
            }
            
            Divider()
            
            // Status
            HStack {
                Text("Status:")
                    .font(BubbleVoiceTypography.caption)
                    .foregroundColor(BubbleVoiceColors.textSecondary)
                
                Spacer()
                
                Text(statusText)
                    .font(BubbleVoiceTypography.captionBold)
                    .foregroundColor(statusColor)
            }
            
            // Quick toggle
            Button {
                appState.isListening.toggle()
            } label: {
                HStack {
                    Image(systemName: appState.isListening ? "stop.circle.fill" : "play.circle.fill")
                    Text(appState.isListening ? "Stop Listening" : "Start Listening")
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(appState.isListening ? Color.red.opacity(0.2) : Color.green.opacity(0.2))
                )
            }
            .buttonStyle(.plain)
            
            Divider()
            
            // Actions
            HStack(spacing: 12) {
                MenuBarActionButton(icon: "clock", label: "History") {
                    // Open history
                }
                
                MenuBarActionButton(icon: "gearshape", label: "Settings") {
                    NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
                }
                
                MenuBarActionButton(icon: "rectangle.expand.vertical", label: "Window") {
                    NSApp.sendAction(#selector(AppDelegate.toggleConversationWindow), to: nil, from: nil)
                }
            }
            
            Divider()
            
            // Quit
            Button {
                NSApp.terminate(nil)
            } label: {
                HStack {
                    Image(systemName: "power")
                    Text("Quit Bubble Voice")
                }
                .foregroundColor(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .frame(width: 260)
    }
    
    private var statusText: String {
        if appState.isSpeaking { return "Speaking" }
        if appState.isListening { return "Listening" }
        if appState.isInitialized { return "Ready" }
        return "Initializing..."
    }
    
    private var statusColor: Color {
        if appState.isSpeaking { return BubbleVoiceColors.speaking }
        if appState.isListening { return BubbleVoiceColors.listening }
        return BubbleVoiceColors.idle
    }
}

struct MenuBarActionButton: View {
    let icon: String
    let label: String
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 16))
                Text(label)
                    .font(BubbleVoiceTypography.caption)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
        }
        .buttonStyle(.plain)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(Color.primary.opacity(0.05))
        )
    }
}
```

---

## 🎭 Animations

### Waveform Animation

```swift
import SwiftUI

/// Animated waveform visualization for voice activity
/// Shows frequency bars that respond to audio levels
///
/// Date: 2026-01-15
struct WaveformView: View {
    let audioLevel: Float  // 0.0 to 1.0
    let barCount: Int = 5
    
    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<barCount, id: \.self) { index in
                WaveformBar(
                    height: barHeight(for: index),
                    color: BubbleVoiceColors.listening
                )
            }
        }
        .animation(.spring(response: 0.2, dampingFraction: 0.5), value: audioLevel)
    }
    
    private func barHeight(for index: Int) -> CGFloat {
        let baseHeight: CGFloat = 8
        let maxHeight: CGFloat = 24
        
        // Create wave pattern
        let position = Float(index) / Float(barCount - 1)
        let waveOffset = sin(position * .pi) * 0.5 + 0.5
        
        // Combine with audio level
        let level = CGFloat(audioLevel) * waveOffset
        
        return baseHeight + (maxHeight - baseHeight) * level
    }
}

struct WaveformBar: View {
    let height: CGFloat
    let color: Color
    
    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(color)
            .frame(width: 4, height: height)
    }
}
```

### State Transitions

```swift
import SwiftUI

/// View modifier for smooth state transitions
/// Adds spring animation to any state change
///
/// Date: 2026-01-15
extension View {
    func smoothStateTransition() -> some View {
        self.animation(
            .spring(response: 0.4, dampingFraction: 0.7, blendDuration: 0.2),
            value: UUID()  // Triggers on any change
        )
    }
}

/// Animated appearance for messages
struct MessageAppearAnimation: ViewModifier {
    let isVisible: Bool
    
    func body(content: Content) -> some View {
        content
            .offset(y: isVisible ? 0 : 20)
            .opacity(isVisible ? 1 : 0)
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isVisible)
    }
}
```

---

## 📝 Notes

- **Liquid Glass requires macOS 16+** - provide fallback for older versions
- **Keep animations subtle** - don't distract from conversation
- **Test with transparency** - ensure readability over any desktop background
- **Respect reduced motion** - disable animations if user prefers
- **Use semantic colors** - adapts automatically to light/dark mode
