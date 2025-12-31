//
//  Components.swift
//  NeighborGuard
//
//  Reusable UI Components
//

import SwiftUI

// MARK: - Header View
struct HeaderView: View {
    let title: String
    let subtitle: String?
    var circleSelector: (() -> Void)?
    var selectedCircleName: String?
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundColor(.white)
                    
                    if let subtitle = subtitle {
                        Text(subtitle)
                            .font(.system(size: 14))
                            .foregroundColor(.white.opacity(0.9))
                    }
                }
                
                Spacer()
                
                if let circleSelector = circleSelector, let name = selectedCircleName {
                    Button(action: circleSelector) {
                        HStack(spacing: 6) {
                            Text(name)
                                .font(.system(size: 14))
                            Image(systemName: "chevron.down")
                                .font(.system(size: 12))
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.white.opacity(0.2))
                        .foregroundColor(.white)
                        .cornerRadius(6)
                        .overlay(
                            RoundedRectangle(cornerRadius: 6)
                                .stroke(Color.white.opacity(0.3), lineWidth: 1)
                        )
                    }
                }
            }
        }
        .padding(20)
        .padding(.top, 44)
        .background(LinearGradient.ngHeader)
    }
}

// MARK: - Card View
struct CardView<Content: View>: View {
    let severity: String?
    let clickable: Bool
    let action: (() -> Void)?
    @ViewBuilder let content: Content
    
    init(severity: String? = nil, clickable: Bool = false, action: (() -> Void)? = nil, @ViewBuilder content: () -> Content) {
        self.severity = severity
        self.clickable = clickable
        self.action = action
        self.content = content()
    }
    
    var body: some View {
        Group {
            if clickable, let action = action {
                Button(action: action) { cardContent }
                .buttonStyle(.plain)
            } else {
                cardContent
            }
        }
    }
    
    private var cardContent: some View {
        HStack(spacing: 0) {
            if let severity = severity {
                Rectangle()
                    .fill(severityColor(severity))
                    .frame(width: 4)
            }
            
            VStack(alignment: .leading, spacing: 0) {
                content
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color.white)
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.08), radius: 8, x: 0, y: 2)
    }
}

// MARK: - Badge View
struct BadgeView: View {
    let text: String
    let backgroundColor: Color
    let textColor: Color
    
    init(_ text: String, background: Color = Color(hex: "f5f5f5"), textColor: Color = .textPrimary) {
        self.text = text
        self.backgroundColor = background
        self.textColor = textColor
    }
    
    var body: some View {
        Text(text)
            .font(.system(size: 12, weight: .medium))
            .foregroundColor(textColor)
            .padding(.horizontal, 12)
            .padding(.vertical, 4)
            .background(backgroundColor)
            .cornerRadius(12)
    }
}

// MARK: - Severity Badge
struct SeverityBadge: View {
    let severity: String
    
    var body: some View {
        BadgeView(Labels.severity(severity), background: severityBackground, textColor: severityColor(severity))
    }
    
    private var severityBackground: Color {
        switch severity {
        case "HIGH": return Color(hex: "fee2e2")
        case "MEDIUM": return Color(hex: "fef3c7")
        case "LOW": return Color(hex: "f1f5f9")
        default: return Color(hex: "f5f5f5")
        }
    }
}

// MARK: - Status Badge
struct StatusBadge: View {
    let status: String
    
    var body: some View {
        Text(Labels.status(status))
            .font(.system(size: 12, weight: .medium))
            .foregroundColor(statusColor(status))
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(statusBackground(status))
            .cornerRadius(16)
    }
}

// MARK: - Alert Info Box
struct AlertInfoBox: View {
    let title: String
    let message: String?
    var buttonTitle: String?
    var buttonAction: (() -> Void)?
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.alertInfoText)
            
            if let message = message {
                Text(message)
                    .font(.system(size: 12))
                    .foregroundColor(.alertInfoText.opacity(0.8))
            }
            
            if let buttonTitle = buttonTitle, let action = buttonAction {
                Button(action: action) {
                    Text(buttonTitle)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(.white)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 12)
                        .background(Color.ngPurple)
                        .cornerRadius(8)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.alertInfoBg)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.alertInfoBorder, lineWidth: 1))
        .cornerRadius(8)
    }
}

// MARK: - Empty State
struct EmptyStateView: View {
    let icon: String
    let message: String
    
    var body: some View {
        VStack(spacing: 16) {
            Text(icon)
                .font(.system(size: 48))
            Text(message)
                .font(.system(size: 16))
                .foregroundColor(.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }
}

// MARK: - Timeline Item
struct TimelineItemView: View {
    let time: String
    let author: String
    let content: String
    let isReaction: Bool
    let isLast: Bool
    
    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            VStack(spacing: 0) {
                SwiftUI.Circle()
                    .fill(Color.ngPurple)
                    .frame(width: 10, height: 10)
                
                if !isLast {
                    Rectangle()
                        .fill(Color.border)
                        .frame(width: 2)
                }
            }
            .frame(width: 20)
            
            VStack(alignment: .leading, spacing: 4) {
                Text(time)
                    .font(.system(size: 12))
                    .foregroundColor(.textMuted)
                
                HStack(spacing: 8) {
                    Text(author)
                        .font(.system(size: 14, weight: .semibold))
                    
                    if isReaction {
                        Text("[Feedback]")
                            .font(.system(size: 12))
                            .foregroundColor(.ngPurple)
                    }
                }
                
                Text(content)
                    .font(.system(size: 14))
                    .foregroundColor(.textSecondary)
            }
            .padding(.leading, 12)
            .padding(.bottom, isLast ? 0 : 20)
        }
    }
}

// MARK: - Feedback Button
struct FeedbackButton: View {
    let icon: String
    let label: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Text(icon)
                    .font(.system(size: 24))
                
                Text(label)
                    .font(.system(size: 14))
                    .foregroundColor(isSelected ? Color(hex: "5b21b6") : .textSecondary)
                    .fontWeight(isSelected ? .medium : .regular)
                    .multilineTextAlignment(.leading)
                
                Spacer()
            }
            .padding(14)
            .background(isSelected ? Color(hex: "ede9fe") : Color(hex: "f9fafb"))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(isSelected ? Color.ngPurple : Color(hex: "e5e7eb"), lineWidth: 2))
            .cornerRadius(12)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Buttons
struct PrimaryButton: View {
    let title: String
    let icon: String?
    let isLoading: Bool
    let action: () -> Void
    
    init(_ title: String, icon: String? = nil, isLoading: Bool = false, action: @escaping () -> Void) {
        self.title = title
        self.icon = icon
        self.isLoading = isLoading
        self.action = action
    }
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if isLoading {
                    ProgressView().tint(.white)
                } else {
                    if let icon = icon {
                        Image(systemName: icon)
                    }
                    Text(title)
                }
            }
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Color.ngPurple)
            .cornerRadius(10)
            .shadow(color: Color.ngPurple.opacity(0.3), radius: 4, x: 0, y: 2)
        }
        .disabled(isLoading)
    }
}

struct SecondaryButton: View {
    let title: String
    let icon: String?
    let action: () -> Void
    
    init(title: String, icon: String? = nil, action: @escaping () -> Void) {
        self.title = title
        self.icon = icon
        self.action = action
    }
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let icon = icon {
                    Image(systemName: icon)
                }
                Text(title)
            }
            .font(.system(size: 16, weight: .medium))
            .foregroundColor(.ngPurple)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Color.white)
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(Color.ngPurple, lineWidth: 2)
            )
        }
    }
}

struct DangerButton: View {
    let title: String
    let icon: String?
    let action: () -> Void
    
    init(title: String, icon: String? = nil, action: @escaping () -> Void) {
        self.title = title
        self.icon = icon
        self.action = action
    }
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let icon = icon {
                    Image(systemName: icon)
                }
                Text(title)
            }
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color.severityHigh)
            .cornerRadius(10)
            .shadow(color: Color.severityHigh.opacity(0.3), radius: 4, x: 0, y: 2)
        }
    }
}

struct ActionButton: View {
    let title: String
    let icon: String
    let color: Color
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 16))
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
            }
            .foregroundColor(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(color)
            .cornerRadius(10)
            .shadow(color: color.opacity(0.3), radius: 4, x: 0, y: 2)
        }
    }
}
