import { sameDay } from './time.js';

const GROUP_GAP_MS = 5 * 60 * 1000;

/** Splits messages into days and runs from the same sender close in time. */
export function groupMessages(messages) {
  const days = [];
  for (const message of messages) {
    let day = days.at(-1);
    if (!day || !sameDay(day.date, message.createdAt)) {
      day = { date: message.createdAt, groups: [] };
      days.push(day);
    }
    const group = day.groups.at(-1);
    const last = group?.messages.at(-1);
    if (group?.sender === message.sender && new Date(message.createdAt) - new Date(last.createdAt) < GROUP_GAP_MS) {
      group.messages.push(message);
    } else {
      day.groups.push({ sender: message.sender, messages: [message] });
    }
  }
  return days;
}
