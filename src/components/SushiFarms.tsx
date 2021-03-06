import React from 'react'
// import { useKeenSlider } from 'keen-slider/react'
// import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
// import { faCaretLeft, faCaretRight } from '@fortawesome/free-solid-svg-icons'

import UIWrapper from './UIWrapper'
import { sushiFarms } from '../FarmLists'
import SushiFarm from './SushiFarm'

export default function SushiFarms() {
  /*
  const [isInitPosition, setInitPosition] = React.useState<boolean>(true)
  const [isLastPosition, setLastPosition] = React.useState<boolean>(false)

  const [sliderRef, slider] = useKeenSlider({
    breakpoints: {
      '(max-width: 768px)': {
        slides: { perView: 1, origin: 'center' },
        vertical: true,
        selector: null,
      },
    },
    slides: { perView: 3, spacing: 10 },
    loop: {
      min: 0,
      max: sushiFarms.length - 1,
    },
    range: {
      align: true,
      min: 0,
      max: sushiFarms.length - 1,
    },
    initial: 0,
    slideChanged: (s) => {
      setLastPosition(s.track.details.abs === s.track.details.maxIdx - 1)
      setInitPosition(s.track.details.abs === 0)
    },
  })

  const slides = React.useMemo(() => {
    return sushiFarms.map((farm) => (
      <div key={farm.address} className="keen-slider__slide">
        <SushiFarm farmName={farm.name} farmAddress={farm.address} farmAbi={farm.abi}/>
      </div>
    ))
  }, [])
  */

  const cards = React.useMemo(() => {
    return sushiFarms.map(({ address, name, abi }, idx) => (
      <div key={address} className={idx > 1 ? 'mt-8' : 'mt-8 lg:mt-0 first:mt-0'}>
        <SushiFarm farmName={name} farmAddress={address} farmAbi={abi} />
      </div>
    ))
  }, [])

  return (
    <UIWrapper>
      {/*
      <div className="relative">
        {slider ? (
          <div
            className="hidden absolute left-0 right-0 top-2 lg:flex lg:items-center lg:justify-between lg:mt-4 lg:-mx-10"
          >
            <button
              type="button"
              onClick={() => slider?.current?.prev()}
              disabled={isInitPosition}
              className={isInitPosition ? 'opacity-0 pointer-events-none' : ''}
            >
              <FontAwesomeIcon icon={faCaretLeft} size="4x" />
            </button>
            <button
              type="button"
              onClick={() => slider?.current?.next()}
              disabled={isLastPosition}
              className={isLastPosition ? 'opacity-0 pointer-events-none' : ''}
            >
              <FontAwesomeIcon icon={faCaretRight} size="4x" />
            </button>
          </div>
        ) : null}
        <div ref={sliderRef} className="mt-8 keen-slider">
          {slides}
        </div>
      </div>
      */}
      <div className="mt-8 lg:grid lg:grid-cols-2 gap-8">{cards}</div>
    </UIWrapper>
  )
}
