import { describe, expect, it } from 'vitest'
import { nairaInWords, numberInWords, moneyTalk } from './money-words.js'

describe('amounts in words', () => {
  it('reads naira the way people say it', () => {
    expect(nairaInWords(2000000)).toBe('twenty thousand naira')
    expect(nairaInWords(20000000)).toBe('two hundred thousand naira')
    expect(nairaInWords(123456789)).toBe('one million, two hundred and thirty-four thousand, five hundred and sixty-seven naira and eighty-nine kobo')
    expect(nairaInWords(10050)).toBe('one hundred naira and fifty kobo')
    expect(numberInWords(0)).toBe('zero')
    expect(numberInWords(2_000_000_000)).toBe('two billion')
  })
})

describe('money talk in chats', () => {
  it('spots off-platform payment and fake-alert talk', () => {
    for (const s of ['Send it to 0123456789', 'my account number is', 'just pay cash', 'I have paid, check your alert', "I've paid", 'use opay', 'here is the screenshot', 'transfer it']) expect(moneyTalk(s)).toBe(true)
    for (const s of ['See you at 9am', 'The tiles are done', 'Can you come on Saturday?', '']) expect(moneyTalk(s)).toBe(false)
  })
})
