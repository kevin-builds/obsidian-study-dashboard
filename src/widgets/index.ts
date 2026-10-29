import type { WidgetDef } from "../dashboard";
import type { WidgetId } from "../settings";
import { activity } from "./activity";
import { calendar, calendarEmbed } from "./calendar";
import { folder, recent, todos } from "./lists";
import { countdown, review, studyplan } from "./study";

export const WIDGETS: Record<WidgetId, WidgetDef> = {
	activity,
	calendar,
	calendarEmbed,
	studyplan,
	countdown,
	todos,
	folder,
	recent,
	review,
};
