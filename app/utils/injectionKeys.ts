import type { InjectionKey, Ref } from 'vue'
import type { FilterState } from '~/types'

export const FILTER_STATE_KEY = Symbol('FILTER_STATE_KEY') as InjectionKey<Ref<FilterState>>
