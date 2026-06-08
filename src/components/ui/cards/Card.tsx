import { forwardRef, HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

const Card = forwardRef((props, ref) => {
  return (
    <div ref={ref} {...props}>
      {props.children}
    </div>
  )
})

Card.displayName = 'Card'

export const CardHeader = forwardRef((props, ref) => {
  return <div ref={ref} {...props} />
})

CardHeader.displayName = 'CardHeader'

export const CardBody = forwardRef((props, ref) => {
  return <div ref={ref} {...props} />
})

CardBody.displayName = 'CardBody'

export const CardFooter = forwardRef((props, ref) => {
  return <div ref={ref} {...props} />
})

CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardBody, CardFooter }
export default Card
