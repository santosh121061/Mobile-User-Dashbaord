import React, { forwardRef, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
  useWindowDimensions,
} from "react-native";
import { useTheme, tokens } from "@/theme";
import { t, type StringKey } from "@/localization";
import { ApiError, ApiTransportError } from "@/api/client";
import { ZodError } from "zod";
import {
  File,
  Mail,
  LockKeyhole,
  UserRound,
  Phone,
  Eye,
  EyeOff,
  ChevronRight,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CanvasTint } from "./gradient";
const ActionArea = React.createContext<"body" | "dock">("body");
export function Label({
  children,
  tone = "primary",
  size = "body",
  style,
  ...props
}: TextProps & {
  tone?: "primary" | "secondary" | "tertiary";
  size?: keyof typeof tokens.typography.scale;
}) {
  const { colors } = useTheme();
  const typography = tokens.typography.scale[size];
  const weightFamily =
    typography.fontWeight === "700"
      ? "Inter_700Bold"
      : typography.fontWeight === "600"
        ? "Inter_600SemiBold"
        : typography.fontWeight === "500"
          ? "Inter_500Medium"
          : "Inter_400Regular";
  const optical =
    (typography.fontWeight === "700" &&
      [22, 26, 30].includes(typography.fontSize)) ||
    (typography.fontWeight === "600" &&
      [15, 18, 22].includes(typography.fontSize)) ||
    (typography.fontWeight === "400" && typography.fontSize === 15);
  return (
    <Text
      {...props}
      style={[
        {
          color: colors.text[tone],
          includeFontPadding: false,
          letterSpacing: ["h1", "greeting", "display"].includes(size)
            ? -0.75
            : size === "title" || size === "h2"
              ? -0.3
              : -typography.fontSize * 0.01,
          fontSize: typography.fontSize,
          lineHeight: typography.lineHeight,
          fontFamily: optical
            ? `${weightFamily}${typography.fontSize}`
            : weightFamily,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Screen({
  children,
  scroll = false,
  style,
  refreshing = false,
  onRefresh,
  contentStyle,
  safeTop = false,
  footer,
  header,
}: React.PropsWithChildren<{
  scroll?: boolean;
  style?: ViewStyle;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: ViewStyle;
  safeTop?: boolean;
  footer?: React.ReactNode;
  header?: React.ReactNode;
}>) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const content = {
    width: "100%" as const,
    maxWidth: 680,
    alignSelf: "center" as const,
    paddingHorizontal: width < 370 ? 12 : width < 600 ? 16 : 24,
    paddingTop: width < 370 ? 12 : width < 600 ? 16 : 22,
    paddingBottom: width < 370 ? 22 : width < 600 ? 28 : 32,
    gap: 12,
    ...contentStyle,
  } satisfies ViewStyle;
  return (
    <KeyboardAvoidingView
      style={[
        {
          flex: 1,
          backgroundColor: colors.canvas,
          paddingTop: safeTop ? insets.top : 0,
        },
        style,
      ]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <CanvasTint />
      {header && (
        <View style={{ paddingHorizontal: width < 600 ? 16 : 24 }}>
          {header}
        </View>
      )}
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={content}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.brand.primary}
                colors={[colors.brand.primary]}
                progressBackgroundColor={colors.surface}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[content, { flex: 1 }]}>{children}</View>
      )}
      {footer && (
        <View
          style={{
            paddingHorizontal: width < 600 ? 16 : 24,
            paddingTop: 8,
            paddingBottom: 14 + insets.bottom,
            borderTopWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.canvas,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 520,
              alignSelf: "center",
              gap: 10,
            }}
          >
            <ActionArea.Provider value="dock">{footer}</ActionArea.Provider>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
export function Card({
  children,
  style,
  heading,
  formSection = false,
}: React.PropsWithChildren<{
  style?: ViewStyle;
  heading?: string;
  formSection?: boolean;
}>) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          padding: formSection && width < 370 ? 14 : 15,
          borderRadius: formSection && width < 370 ? 13 : 14,
          borderWidth: 1,
          borderColor: colors.border,
          gap: 12,
        },
        style,
      ]}
    >
      {heading && (
        <Label
          size="bodyMedium"
          style={{
            fontSize: width < 370 ? 14 : 15,
            lineHeight: width < 370 ? 20 : 21,
            paddingBottom: 11,
            marginBottom: 2,
            borderBottomWidth: 1,
            borderColor: colors.border,
          }}
        >
          {heading}
        </Label>
      )}
      {children}
    </View>
  );
}
export function Button({
  label,
  onPress,
  disabled,
  loading,
  variant = "primary",
  testID,
  icon,
  iconPosition = "before",
  compact = false,
  style,
  displayLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "outline" | "danger" | "tertiary";
  testID?: string;
  icon?: React.ReactNode;
  iconPosition?: "before" | "after";
  compact?: boolean;
  style?: ViewStyle;
  displayLabel?: string;
}) {
  const { colors, dark } = useTheme();
  const { width } = useWindowDimensions();
  const actionArea = React.useContext(ActionArea);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{
        disabled: !!(disabled || loading),
        busy: loading,
      }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        minHeight: actionArea === "dock" && width >= 370 ? 51 : 48,
        minWidth: 48,
        paddingVertical: variant === "tertiary" ? 8 : 12,
        paddingHorizontal: variant === "tertiary" ? (compact ? 2 : 8) : 15,
        borderRadius: actionArea === "dock" ? 12 : 11,
        flexDirection: "row",
        gap: 8,
        overflow: "hidden",
        opacity: disabled || loading ? 0.45 : 1,
        transform: [{ scale: pressed ? 0.975 : 1 }],
        alignItems: "center",
        justifyContent: "center",
        backgroundColor:
          variant === "tertiary"
            ? "transparent"
            : variant === "secondary"
              ? "#EEF4FF"
              : variant === "outline"
                ? colors.surface
                : variant === "danger"
                  ? pressed
                    ? colors.status.dangerPressed
                    : colors.status.danger
                  : pressed
                    ? "#0E4FCC"
                    : "#155EEF",
        borderWidth: 1,
        borderColor:
          variant === "secondary"
            ? "#DCE8FF"
            : variant === "outline"
              ? dark
                ? "#3A5578"
                : "#D7E0EA"
              : "transparent",
        boxShadow:
          variant === "primary"
            ? "0px 4px 10px rgba(21,94,239,0.18)"
            : undefined,
        ...style,
      })}
    >
      {({ pressed }) => {
        const foreground =
          variant === "secondary" ||
          variant === "tertiary" ||
          variant === "outline"
            ? variant === "secondary"
              ? "#155EEF"
              : variant === "outline"
                ? dark
                  ? colors.text.primary
                  : "#31445E"
                : "#5B6F89"
            : variant === "danger"
              ? pressed
                ? colors.status.dangerPressedText
                : colors.status.dangerButtonText
              : "#FFFFFF";
        return loading ? (
          <ActivityIndicator color={foreground} />
        ) : (
          <>
            {icon && iconPosition === "before" && (
              <View style={{ zIndex: 1 }}>{icon}</View>
            )}
            <Label
              size={variant === "tertiary" ? "captionMedium" : "button"}
              style={{
                color: foreground,
                fontFamily: "Inter_650DemiBold15",
                letterSpacing: -0.15,
                fontSize: compact
                  ? width <= 330
                    ? 10
                    : 11
                  : width <= 330
                    ? 12
                    : 15,
                lineHeight: compact ? 16 : 22,
              }}
            >
              {displayLabel ?? label}
            </Label>
            {icon && iconPosition === "after" && (
              <View style={{ zIndex: 1 }}>{icon}</View>
            )}
          </>
        );
      }}
    </Pressable>
  );
}
export const Input = forwardRef<
  TextInput,
  TextInputProps & {
    label: string;
    error?: string;
    help?: string;
    leading?: React.ReactNode;
    trailing?: React.ReactNode;
    hideLabel?: boolean;
    required?: boolean;
    containerStyle?: ViewStyle;
  }
>(function Input(
  {
    label,
    error,
    help,
    style,
    leading,
    trailing,
    hideLabel,
    required,
    containerStyle,
    ...props
  },
  ref,
) {
  const { colors, dark } = useTheme();
  const { width } = useWindowDimensions();
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const automaticPassword = !!props.secureTextEntry && !trailing;
  const FieldIcon = props.secureTextEntry
    ? LockKeyhole
    : /email/i.test(label)
      ? Mail
      : /name/i.test(label)
        ? UserRound
        : /phone/i.test(label)
          ? Phone
          : undefined;
  const prefix =
    leading ??
    (FieldIcon && !hideLabel ? (
      <FieldIcon
        size={19}
        strokeWidth={1.85}
        color={dark ? colors.text.tertiary : "#8CA1C0"}
      />
    ) : null);
  return (
    <View style={{ gap: 7, ...containerStyle }}>
      {!hideLabel && (
        <Label
          tone="secondary"
          size="captionMedium"
          style={{
            fontFamily: "Inter_650DemiBold",
            fontSize: 11,
            lineHeight: 16,
            letterSpacing: width < 370 ? 0.11 : 0.44,
          }}
        >
          {label}
          {required && (
            <Text style={{ color: colors.status.dangerText }}> *</Text>
          )}
        </Label>
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: hideLabel || width < 370 ? 48 : 50,
          borderRadius: 11,
          borderWidth: 1,
          borderColor: error
            ? "#D96A7F"
            : focused
              ? colors.focus
              : colors.border,
          backgroundColor: colors.surface,
          boxShadow: error
            ? "0px 0px 0px 3px rgba(217,106,127,0.08)"
            : focused
              ? "0px 0px 0px 3px rgba(21,94,239,0.11)"
              : undefined,
          paddingHorizontal: width < 370 || hideLabel ? 12 : 14,
          gap: 10,
          overflow: "hidden",
        }}
      >
        {prefix}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={dark ? "#93A6C5" : "#7B8EAE"}
          {...props}
          secureTextEntry={
            automaticPassword ? !showPassword : props.secureTextEntry
          }
          onFocus={(event) => {
            setFocused(true);
            props.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            props.onBlur?.(event);
          }}
          style={[
            {
              minHeight: hideLabel || width < 370 ? 46 : 48,
              flex: 1,
              minWidth: 0,
              color: colors.text.primary,
              backgroundColor: "transparent",
              paddingHorizontal: 0,
              paddingVertical: hideLabel ? 11 : 12,
              fontFamily: "Inter_400Regular",
              fontSize: width < 370 ? 13 : 14,
              lineHeight: 24,
              includeFontPadding: false,
            },
            style,
          ]}
        />
        {trailing}
        {automaticPassword && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(
              showPassword ? "hidePassword" : "showPassword",
            )}
            onPress={() => setShowPassword((value) => !value)}
            hitSlop={{ left: 9, right: 9 }}
            style={{
              width: 30,
              minHeight: 48,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {showPassword ? (
              <EyeOff
                size={19}
                color={dark ? colors.text.secondary : "#7288AB"}
              />
            ) : (
              <Eye size={19} color={dark ? colors.text.secondary : "#7288AB"} />
            )}
          </Pressable>
        )}
      </View>
      {!!error && (
        <Label
          accessibilityLiveRegion="polite"
          style={{ color: "#B4233F", fontSize: 10, lineHeight: 15 }}
          size="caption"
        >
          {error}
        </Label>
      )}
      {!!help && (
        <Label
          size="caption"
          tone="secondary"
          style={{
            fontSize: width < 370 ? 10 : 11,
            lineHeight: width < 370 ? 14 : 16,
          }}
        >
          {help}
        </Label>
      )}
    </View>
  );
});
export function Chip({
  label,
  selected,
  onPress,
  disabled = false,
  hint,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  const { colors, dark } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityHint={hint}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 48,
        minWidth: 48,
        justifyContent: "center",
        paddingHorizontal: 0,
        marginEnd: 5,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <View
        style={{
          minHeight: 34,
          justifyContent: "center",
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 9,
          borderWidth: 1,
          borderColor: selected
            ? dark
              ? "#395384"
              : "#155EEF"
            : "transparent",
          backgroundColor: selected
            ? dark
              ? colors.brand.primarySoft
              : "#155EEF"
            : "transparent",
          boxShadow: selected ? "0px 3px 7px rgba(21,94,239,0.16)" : undefined,
        }}
      >
        <Label
          size="captionMedium"
          style={{
            color: selected
              ? "#FFFFFF"
              : dark
                ? colors.text.secondary
                : "#6C7C91",
            fontSize: 11,
            lineHeight: 16,
          }}
        >
          {label}
        </Label>
      </View>
    </Pressable>
  );
}
export function Row({
  title,
  subtitle,
  accessibilityLabel,
  trailing,
  onPress,
  onLongPress,
  selected,
  leading,
  metadata,
  metadataPosition = "after",
  status,
  grouped = false,
  leadingSize = 36,
  style,
}: {
  title: string;
  subtitle?: string;
  accessibilityLabel?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  leading?: React.ReactNode;
  metadata?: string;
  metadataPosition?: "after" | "below";
  status?: "enabled" | "disabled" | "archived";
  grouped?: boolean;
  leadingSize?: number;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const leadingIcon =
    React.isValidElement<{ size?: number; color?: string }>(leading) &&
    typeof leading.props.size === "number"
      ? leading
      : null;
  const iconSurface =
    leadingIcon?.props.color === colors.accent.mint ||
    leadingIcon?.props.color === colors.status.successText
      ? colors.status.successSoft
      : leadingIcon?.props.color === colors.accent.purple
        ? colors.accent.purpleSoft
        : leadingIcon?.props.color === colors.accent.gold
          ? colors.accent.goldSoft
          : colors.brand.primarySoft;
  return (
    <View
      style={{
        minHeight: 62,
        paddingHorizontal: 11,
        paddingVertical: 0,
        borderRadius: grouped ? 0 : 12,
        marginBottom: grouped ? 0 : 6,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderWidth: grouped ? 0 : 1,
        borderBottomWidth: grouped ? 1 : 1,
        borderColor: colors.border,
        backgroundColor: selected ? colors.brand.primarySoft : colors.surface,
        ...style,
      }}
    >
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={
          accessibilityLabel ??
          [title, subtitle, status && t(status), metadata]
            .filter(Boolean)
            .join(", ")
        }
        accessibilityState={{ selected }}
        style={{
          minHeight: 60,
          paddingVertical: 10,
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: selected ? colors.brand.primarySoft : colors.surface,
        }}
      >
        {leadingIcon ? (
          <View
            style={{
              width: leadingSize,
              height: leadingSize,
              borderRadius: 10,
              backgroundColor: iconSurface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {leadingIcon}
          </View>
        ) : (
          (leading ?? (
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: colors.brand.primarySoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Label size="bodyMedium" style={{ color: colors.brand.primary }}>
                {title
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part.charAt(0))
                  .join("")}
              </Label>
            </View>
          ))
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Label size="bodyMedium" style={{ letterSpacing: -0.2 }}>
            {title}
          </Label>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
            }}
          >
            {!!subtitle && (
              <Label size="secondary" tone="secondary">
                {subtitle}
              </Label>
            )}
            {status && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor:
                      status === "enabled"
                        ? colors.status.successText
                        : status === "archived"
                          ? colors.status.warningText
                          : colors.text.secondary,
                  }}
                />
                <Label
                  size="caption"
                  style={{
                    color:
                      status === "enabled"
                        ? colors.status.successText
                        : status === "archived"
                          ? colors.status.warningText
                          : colors.text.secondary,
                  }}
                >
                  {t(status)}
                </Label>
              </View>
            )}
          </View>
          {!!metadata && metadataPosition === "below" && (
            <Label size="caption" tone="secondary">
              {metadata}
            </Label>
          )}
        </View>
        {!!metadata && metadataPosition === "after" && (
          <Label
            size="caption"
            tone="secondary"
            style={{ maxWidth: 96, textAlign: "right" }}
          >
            {metadata}
          </Label>
        )}
      </Pressable>
      {trailing ??
        (onPress && <ChevronRight size={18} color={colors.text.tertiary} />)}
    </View>
  );
}
export function Loading() {
  const { colors } = useTheme();
  return (
    <View accessibilityLabel={t("loading")} style={{ gap: 16, padding: 16 }}>
      {[0, 1, 2].map((key) => (
        <View
          key={key}
          style={{
            height: 64,
            borderRadius: 16,
            backgroundColor: colors.surfaceMuted,
          }}
        />
      ))}
    </View>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  if (error instanceof ApiError && error.status === 409)
    return <ConflictState refresh={retry} requestId={error.requestId} />;
  if (error instanceof ApiError && error.status === 503)
    return (
      <MaintenanceState
        retry={retry}
        requestId={error.requestId}
        retryAfter={error.retryAfter}
        retryAt={error.retryAt}
      />
    );
  let title: StringKey = "appRequestFailed",
    hint: StringKey = "appRequestFailedHint";
  if (error instanceof ApiTransportError) {
    title =
      error.reason === "timeout"
        ? "requestTimeout"
        : error.reason === "cancelled"
          ? "requestCancelled"
          : error.reason === "tls"
            ? "secureConnectionFailed"
            : "connection";
    hint =
      error.reason === "tls"
        ? "secureConnectionFailedHint"
        : error.reason === "network"
          ? "connectionHint"
          : "requestRetryHint";
  } else if (error instanceof SyntaxError || error instanceof ZodError) {
    title = "invalidResponse";
    hint = "invalidResponseHint";
  }
  if (error instanceof ApiError) {
    if (error.status === 426 && error.code === "MOBILE_UPDATE_REQUIRED") {
      title = "updateRequired";
      hint = "updateRequiredHint";
    } else if (error.status === 401) {
      title = "signInRequired";
      hint = "signInRequiredHint";
    } else if (
      error.status === 403 &&
      error.code === "MOBILE_REAUTH_REQUIRED"
    ) {
      title = "serverApprovalRequired";
      hint = "serverApprovalRequiredHint";
    } else if (error.status === 403 || error.status === 404) {
      title = "forbidden";
      hint = "forbiddenHint";
    } else if (error.status === 429) {
      title = "rateLimit";
      hint = "rateLimit";
    } else if (error.status === 422) {
      title = "validation";
      hint = "validation";
    } else if (error.status === 410) {
      title = "exportExpired";
      hint = "exportExpired";
    } else if (error.status >= 500) {
      title = "serverError";
      hint = "serverError";
    }
  }
  return (
    <Card>
      <Label accessibilityRole="header" size="title">
        {t(title)}
      </Label>
      <Label tone="secondary">{t(hint)}</Label>
      {error instanceof ApiError && error.requestId && (
        <Label size="caption">
          {t("supportId")}: {error.requestId}
        </Label>
      )}
      {retry && (
        <RetryButton
          key={
            error instanceof ApiError
              ? [error.status, error.requestId, error.retryAfter].join(":")
              : "network"
          }
          delay={
            error instanceof ApiError && error.status === 429
              ? (error.retryAfter ?? 60)
              : 0
          }
          retryAt={error instanceof ApiError ? error.retryAt : undefined}
          retry={retry}
        />
      )}
    </Card>
  );
}
export function ConflictState({
  refresh,
  requestId,
}: {
  refresh?: () => void;
  requestId?: string | null;
}) {
  return (
    <Card>
      <Label accessibilityRole="header" size="title">
        {t("conflict")}
      </Label>
      <Label tone="secondary">{t("conflictHint")}</Label>
      {!!requestId && (
        <Label size="caption">
          {t("supportId")}: {requestId}
        </Label>
      )}
      {refresh && (
        <Button variant="secondary" label={t("refresh")} onPress={refresh} />
      )}
    </Card>
  );
}
export function MaintenanceState({
  retry,
  requestId,
  retryAfter = 0,
  retryAt,
}: {
  retry?: () => void;
  requestId?: string | null;
  retryAfter?: number;
  retryAt?: number;
}) {
  return (
    <Card>
      <Label accessibilityRole="header" size="title">
        {t("maintenance")}
      </Label>
      <Label tone="secondary">{t("maintenanceHint")}</Label>
      {!!requestId && (
        <Label size="caption">
          {t("supportId")}: {requestId}
        </Label>
      )}
      {retry && (
        <RetryButton
          key={[requestId, retryAfter].join(":")}
          delay={retryAfter}
          retryAt={retryAt}
          retry={retry}
        />
      )}
    </Card>
  );
}
export function AvailabilityState({
  error,
  apiDisabled = false,
  configured = true,
  retry,
  logout,
}: {
  error?: unknown;
  apiDisabled?: boolean;
  configured?: boolean;
  retry: () => void;
  logout: () => void;
}) {
  return (
    <Screen scroll>
      {configured && error !== undefined ? (
        <ErrorState error={error} retry={retry} />
      ) : (
        <Card>
          <Label accessibilityRole="header" size="title">
            {t(
              !configured
                ? "setup"
                : apiDisabled
                  ? "apiDisabled"
                  : "connection",
            )}
          </Label>
          <Label tone="secondary">
            {t(
              !configured
                ? "setupHint"
                : apiDisabled
                  ? "apiDisabledHint"
                  : "connectionHint",
            )}
          </Label>
          <Button variant="secondary" label={t("retry")} onPress={retry} />
        </Card>
      )}
      <Button variant="secondary" label={t("logout")} onPress={logout} />
    </Screen>
  );
}
function RetryButton({
  delay,
  retry,
  retryAt,
}: {
  delay: number;
  retry: () => void;
  retryAt?: number;
}) {
  const [deadline] = useState(
    () => retryAt ?? Date.now() + Math.max(0, delay) * 1000,
  );
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!delay) return;
    const timer = setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      if (timestamp >= deadline) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [delay, deadline]);
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <Button
      variant="secondary"
      label={seconds ? t("retryWait", { seconds }) : t("retry")}
      disabled={seconds > 0}
      onPress={retry}
    />
  );
}
export function Empty() {
  const { colors } = useTheme();
  return (
    <View
      style={{
        minHeight: 200,
        padding: 24,
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
      }}
    >
      <File size={40} color={colors.text.secondary} />
      <Label size="title" style={{ textAlign: "center" }}>
        {t("empty")}
      </Label>
      <Label size="caption" tone="secondary" style={{ textAlign: "center" }}>
        {t("emptyHint")}
      </Label>
    </View>
  );
}
